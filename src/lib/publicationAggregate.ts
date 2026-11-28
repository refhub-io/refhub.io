// Extracted from Dashboard.tsx so the "cross-vault publication aggregate"
// logic exists in exactly one place. Dashboard.tsx uses these for its main
// list; useAllPublications() (src/hooks/useAllPublications.ts) uses them for
// smart collections. No behavior change from what Dashboard.tsx did inline.
import type { Publication, PublicationTag } from '@/types/database';

export interface VaultPublicationLink {
  id: string;
  vault_id: string;
  original_publication_id: string | null;
}

export interface RawVaultPublicationRow {
  id: string;
  vault_id: string;
  created_by: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  pdf_url: string | null;
  bibtex_key: string | null;
  publication_type: string;
  notes: string | null;
  booktitle: string | null;
  chapter: string | null;
  edition: string | null;
  editor: string[] | null;
  howpublished: string | null;
  institution: string | null;
  number: string | null;
  organization: string | null;
  publisher: string | null;
  school: string | null;
  series: string | null;
  type: string | null;
  eid: string | null;
  isbn: string | null;
  issn: string | null;
  keywords: string[] | null;
  reading_state?: string;
  important?: boolean;
  created_at: string;
  updated_at: string;
  original_publication_id: string | null;
  section_id?: string | null;
  section_position?: number | null;
  featured?: boolean | null;
  featured_note?: string | null;
}

type PublicationDisplayField = keyof Pick<
  Publication,
  | 'title' | 'authors' | 'year' | 'journal' | 'volume' | 'issue' | 'pages'
  | 'doi' | 'url' | 'abstract' | 'pdf_url' | 'bibtex_key' | 'publication_type'
  | 'booktitle' | 'chapter' | 'edition' | 'editor' | 'howpublished' | 'institution'
  | 'number' | 'organization' | 'publisher' | 'school' | 'series' | 'type'
  | 'eid' | 'isbn' | 'issn' | 'keywords'
>;

const DISPLAY_METADATA_FIELDS: PublicationDisplayField[] = [
  'title', 'authors', 'year', 'journal', 'volume', 'issue', 'pages', 'doi',
  'url', 'abstract', 'pdf_url', 'bibtex_key', 'publication_type', 'booktitle',
  'chapter', 'edition', 'editor', 'howpublished', 'institution', 'number',
  'organization', 'publisher', 'school', 'series', 'type', 'eid', 'isbn',
  'issn', 'keywords',
];

const hasDisplayValue = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
};

export const mergeMissingDisplayMetadata = (canonical: Publication, instance: Publication): Publication => {
  const merged: Publication = { ...canonical };

  DISPLAY_METADATA_FIELDS.forEach((field) => {
    const canonicalValue = merged[field];
    const instanceValue = instance[field];

    if (!hasDisplayValue(canonicalValue) && hasDisplayValue(instanceValue)) {
      (merged as Record<PublicationDisplayField, Publication[PublicationDisplayField]>)[field] = instanceValue;
    }
  });

  return merged;
};

export function buildAllPublications(
  originalPublications: Publication[],
  rawVaultPublications: RawVaultPublicationRow[],
): { allPublications: Publication[]; vaultPublicationLinks: VaultPublicationLink[] } {
  const formattedVaultPublications = rawVaultPublications.map((vp) => ({
    id: vp.id,
    user_id: vp.created_by,
    title: vp.title,
    // vault_publications.authors is nullable; every list here calls .length on it.
    authors: vp.authors ?? [],
    year: vp.year,
    journal: vp.journal,
    volume: vp.volume,
    issue: vp.issue,
    pages: vp.pages,
    doi: vp.doi,
    url: vp.url,
    abstract: vp.abstract,
    pdf_url: vp.pdf_url,
    bibtex_key: vp.bibtex_key,
    publication_type: vp.publication_type,
    notes: vp.notes,
    booktitle: vp.booktitle,
    chapter: vp.chapter,
    edition: vp.edition,
    editor: vp.editor,
    howpublished: vp.howpublished,
    institution: vp.institution,
    number: vp.number,
    organization: vp.organization,
    publisher: vp.publisher,
    school: vp.school,
    series: vp.series,
    type: vp.type,
    eid: vp.eid,
    isbn: vp.isbn,
    issn: vp.issn,
    keywords: vp.keywords,
    reading_state: vp.reading_state || 'unread',
    important: vp.important ?? false,
    created_at: vp.created_at,
    updated_at: vp.updated_at,
    original_publication_id: vp.original_publication_id,
    section_id: vp.section_id ?? null,
    section_position: vp.section_position ?? 0,
    featured: vp.featured ?? false,
    featured_note: vp.featured_note ?? null,
  })) as (Publication & { original_publication_id: string | null })[];

  const allPublicationsMap: Record<string, Publication> = {};

  originalPublications.forEach((pub) => {
    allPublicationsMap[pub.id] = pub;
  });

  // A vault copy whose canonical paper isn't readable stands in for that paper, under the copy's
  // own id. Users can only read their own canonical rows, so the papers in a vault shared with
  // them, and those a collaborator added to their own vaults, point at canonical rows they can't
  // see: those copies used to be dropped. Further copies of the same paper fill in what the
  // stand-in lacks, the way copies fill in a canonical paper.
  const standInIds: Record<string, string> = {};
  formattedVaultPublications.forEach((vp) => {
    if (vp.original_publication_id) {
      const canonical = allPublicationsMap[vp.original_publication_id];
      if (canonical) {
        allPublicationsMap[vp.original_publication_id] = mergeMissingDisplayMetadata(canonical, vp as Publication);
        return;
      }
      const standInId = standInIds[vp.original_publication_id];
      if (standInId) {
        allPublicationsMap[standInId] = mergeMissingDisplayMetadata(allPublicationsMap[standInId], vp as Publication);
      } else {
        standInIds[vp.original_publication_id] = vp.id;
        allPublicationsMap[vp.id] = vp as Publication;
      }
    } else if (!allPublicationsMap[vp.id]) {
      allPublicationsMap[vp.id] = vp as Publication;
    }
  });

  const vaultPublicationLinks: VaultPublicationLink[] = rawVaultPublications.map((vp) => ({
    id: vp.id,
    vault_id: vp.vault_id,
    original_publication_id: vp.original_publication_id,
  }));

  return { allPublications: Object.values(allPublicationsMap), vaultPublicationLinks };
}

/**
 * Maps a paper id to its entry in buildAllPublications' list. A vault copy's id goes to its
 * canonical paper's entry, or to the copy standing in for that paper when it isn't readable; a
 * canonical id goes to its stand-in, if it has one. Any other id comes back unchanged, so a
 * standalone copy or a canonical paper maps to itself.
 */
export function buildEntryIdResolver(
  publications: Publication[],
  vaultPublicationLinks: VaultPublicationLink[],
): (id: string) => string {
  const entryIds = new Set(publications.map((pub) => pub.id));
  // Only stand-ins carry original_publication_id: canonical rows have no such column, and copies
  // merged into their canonical paper aren't entries.
  const standInFor = new Map<string, string>();
  publications.forEach((pub) => {
    const original = (pub as Publication & { original_publication_id?: string | null }).original_publication_id;
    if (original) standInFor.set(original, pub.id);
  });
  const linksById = new Map(vaultPublicationLinks.map((link) => [link.id, link]));
  const canonicalEntry = (id: string) => (entryIds.has(id) ? id : standInFor.get(id) ?? id);
  return (id) => canonicalEntry(linksById.get(id)?.original_publication_id || id);
}

export function buildPublicationVaultsMap(
  publications: Publication[],
  vaultPublicationLinks: VaultPublicationLink[],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  publications.forEach((pub) => { map[pub.id] = []; });
  // A copy belongs to its canonical paper's entry, or to its stand-in's, or, standalone, to its own.
  const entryId = buildEntryIdResolver(publications, vaultPublicationLinks);
  vaultPublicationLinks.forEach((link) => {
    const key = entryId(link.id);
    if (!map[key]) map[key] = [];
    if (!map[key].includes(link.vault_id)) map[key].push(link.vault_id);
  });
  return map;
}

export function buildPublicationTagsMap(
  publications: Publication[],
  publicationTags: PublicationTag[],
  vaultPublicationLinks: VaultPublicationLink[],
): Record<string, string[]> {
  const linksById = new Map(vaultPublicationLinks.map((link) => [link.id, link]));
  const originalPubTagsMap: Record<string, string[]> = {};

  publicationTags.forEach((pt) => {
    if (pt.publication_id) {
      (originalPubTagsMap[pt.publication_id] ??= []).push(pt.tag_id);
    }
    if (pt.vault_publication_id) {
      const originalId = linksById.get(pt.vault_publication_id)?.original_publication_id || pt.vault_publication_id;
      (originalPubTagsMap[originalId] ??= []).push(pt.tag_id);
    }
  });

  const map: Record<string, string[]> = {};
  publications.forEach((pub) => {
    const originalId = (pub as Publication & { original_publication_id?: string }).original_publication_id || pub.id;
    map[pub.id] = [...new Set(originalPubTagsMap[originalId] || [])];
  });
  return map;
}
