import { fetchDOIMetadata, type DOIMetadata } from './bibtex';

const ARXIV_ID_PATTERN = /(\d{4}\.\d{4,5})(v\d+)?/;

export function normalizeArxivId(input: string): string | null {
  const match = input.trim().match(ARXIV_ID_PATTERN);
  return match ? `${match[1]}${match[2] || ''}` : null;
}

/** arXiv auto-mints a DOI in this form for every submission since ~2022,
 * largely backfilled for older ones too — see spec's "Metadata fetching" section. */
export function arxivIdToDoi(arxivId: string): string {
  const bareId = arxivId.replace(/v\d+$/, '');
  return `10.48550/arXiv.${bareId}`;
}

export async function fetchArxivMetadata(arxivId: string): Promise<DOIMetadata | null> {
  try {
    return await fetchDOIMetadata(arxivIdToDoi(arxivId));
  } catch {
    // Genuinely uncovered (very old, never-backfilled) arXiv paper — degrade
    // to unenriched rather than blocking capture, same convention as every
    // other best-effort enrichment path in this codebase.
    return null;
  }
}
