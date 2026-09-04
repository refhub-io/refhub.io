import { getAccessToken, type DOIMetadata } from './bibtex';
import { getBackendApiBaseUrl } from '@/lib/apiKeys';

const S2_PAPER_URL_PATTERN = /semanticscholar\.org\/paper\/[^/]+\/([a-f0-9]+)/i;

export function parseS2PaperIdFromUrl(url: string): string | null {
  const match = url.trim().match(S2_PAPER_URL_PATTERN);
  return match ? match[1] : null;
}

/** Mirrors fetchFromSemanticScholar's exact request shape (bibtex.ts:619-638)
 * — same route, same auth, same response envelope — with s2_paper_id in
 * place of doi, since a raw S2 paper id has no DOI to piggyback on the way
 * arXiv ids do. */
export async function fetchS2UrlMetadata(paperId: string): Promise<DOIMetadata | null> {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${getBackendApiBaseUrl()}/doi-metadata`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ s2_paper_id: paperId }),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    return (payload?.data as DOIMetadata | null) ?? null;
  } catch {
    return null;
  }
}
