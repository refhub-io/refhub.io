import { Publication } from '@/types/database';
import { SemanticScholarMetadata } from '@/lib/semanticScholar';

// Fields that are shared bibliographic data and should propagate across all copies
// of a publication. Vault-specific fields (notes, tags) are intentionally excluded.
export const BIBLIOGRAPHIC_FIELDS = [
  'title', 'authors', 'year', 'journal', 'volume', 'issue', 'pages', 'doi', 'url',
  'abstract', 'pdf_url', 'bibtex_key', 'publication_type', 'booktitle', 'chapter',
  'edition', 'editor', 'howpublished', 'institution', 'number', 'organization',
  'publisher', 'school', 'series', 'type', 'eid', 'isbn', 'issn', 'keywords',
] as const;

export type BibliographicField = typeof BIBLIOGRAPHIC_FIELDS[number];

export function extractBibliographicPatch(data: Partial<Publication>): Partial<Publication> {
  const patch: Partial<Publication> = {};
  for (const field of BIBLIOGRAPHIC_FIELDS) {
    if (field in data) {
      (patch as Record<string, unknown>)[field] = data[field as keyof Publication];
    }
  }
  return patch;
}

export type PublicationSyncField = 'title' | 'authors' | 'year' | 'journal' | 'doi' | 'url' | 'abstract' | 'publication_type';

export interface PublicationSyncDiff {
  field: PublicationSyncField;
  label: string;
  current: string | number | string[] | null;
  incoming: string | number | string[] | null;
}

const SYNC_FIELDS: Array<{ field: PublicationSyncField; label: string }> = [
  { field: 'title', label: 'title' },
  { field: 'authors', label: 'authors' },
  { field: 'year', label: 'year' },
  { field: 'journal', label: 'venue' },
  { field: 'doi', label: 'doi' },
  { field: 'url', label: 'url' },
  { field: 'abstract', label: 'abstract' },
  { field: 'publication_type', label: 'type' },
];

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeComparable(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(normalizeString).filter(Boolean).join('|').toLowerCase();
  }
  return normalizeString(value).toLowerCase();
}

function incomingValue(metadata: SemanticScholarMetadata, field: PublicationSyncField) {
  if (field === 'publication_type') return metadata.type ?? null;
  return metadata[field] ?? null;
}

export function getPublicationSyncDiffs(
  publication: Publication,
  metadata: SemanticScholarMetadata,
): PublicationSyncDiff[] {
  return SYNC_FIELDS.flatMap(({ field, label }) => {
    const incoming = incomingValue(metadata, field);
    if (incoming === undefined || incoming === null || incoming === '' || (Array.isArray(incoming) && incoming.length === 0)) {
      return [];
    }

    const current = publication[field] ?? null;
    if (normalizeComparable(current) === normalizeComparable(incoming)) {
      return [];
    }

    return [{ field, label, current, incoming }];
  });
}

export function createPublicationSyncPatch(diffs: PublicationSyncDiff[]): Partial<Publication> {
  return diffs.reduce<Partial<Publication>>((patch, diff) => {
    if (diff.field === 'publication_type') {
      patch.publication_type = String(diff.incoming || 'article');
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (patch as any)[diff.field] = diff.incoming;
    }
    return patch;
  }, {});
}

export function formatSyncValue(value: string | number | string[] | null): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}
