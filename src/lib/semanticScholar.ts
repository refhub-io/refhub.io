const BASE_URL = 'https://api.semanticscholar.org/graph/v1';

const PAPER_FIELDS = 'paperId,title,authors,year,citationCount,externalIds,abstract,url';

export interface SSPaper {
  paperId: string;
  title: string;
  authors: { name: string }[];
  year: number | null;
  citationCount: number | null;
  externalIds: { DOI?: string } | null;
  abstract: string | null;
  url: string | null;
}

// In-memory cache keyed by cache key
const paperCache = new Map<string, SSPaper[]>();

// Rate-limiting queue — SS public API allows ~1 req/sec without an API key.
// All requests are serialised through this chain with a 300ms gap between them.
const MIN_INTERVAL_MS = 300;
let requestQueue: Promise<void> = Promise.resolve();

async function fetchJSON<T>(url: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requestQueue = requestQueue
      .catch(() => {})                                      // don't stall on previous errors
      .then(() => new Promise<void>((r) => setTimeout(r, MIN_INTERVAL_MS)))
      .then(async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) {
            reject(new Error(`Semantic Scholar API error: ${res.status} ${res.statusText}`));
          } else {
            resolve(await res.json() as T);
          }
        } catch (err) {
          reject(err);
        }
      });
  });
}

export async function lookupPaperByDOI(doi: string): Promise<string | null> {
  try {
    const data = await fetchJSON<{ paperId?: string }>(
      `${BASE_URL}/paper/DOI:${encodeURIComponent(doi)}?fields=paperId`
    );
    return data.paperId ?? null;
  } catch {
    return null;
  }
}

export async function lookupPaperByTitle(title: string): Promise<string | null> {
  try {
    const data = await fetchJSON<{ data?: { paperId: string }[] }>(
      `${BASE_URL}/paper/search?query=${encodeURIComponent(title)}&fields=paperId&limit=1`
    );
    return data.data?.[0]?.paperId ?? null;
  } catch {
    return null;
  }
}

export async function getReferences(paperId: string): Promise<SSPaper[]> {
  const cacheKey = `refs:${paperId}`;
  if (paperCache.has(cacheKey)) return paperCache.get(cacheKey)!;

  try {
    const data = await fetchJSON<{ data?: { citedPaper: SSPaper }[] }>(
      `${BASE_URL}/paper/${paperId}/references?fields=${PAPER_FIELDS}&limit=50`
    );
    const papers = (data.data ?? []).map((d) => d.citedPaper).filter(Boolean);
    paperCache.set(cacheKey, papers);
    return papers;
  } catch {
    return [];
  }
}

export async function getCitations(paperId: string): Promise<SSPaper[]> {
  const cacheKey = `cites:${paperId}`;
  if (paperCache.has(cacheKey)) return paperCache.get(cacheKey)!;

  try {
    const data = await fetchJSON<{ data?: { citingPaper: SSPaper }[] }>(
      `${BASE_URL}/paper/${paperId}/citations?fields=${PAPER_FIELDS}&limit=50`
    );
    const papers = (data.data ?? []).map((d) => d.citingPaper).filter(Boolean);
    paperCache.set(cacheKey, papers);
    return papers;
  } catch {
    return [];
  }
}

export async function getRecommendations(paperId: string): Promise<SSPaper[]> {
  const cacheKey = `recs:${paperId}`;
  if (paperCache.has(cacheKey)) return paperCache.get(cacheKey)!;

  try {
    const data = await fetchJSON<{ recommendedPapers?: SSPaper[] }>(
      `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${paperId}?fields=${PAPER_FIELDS}&limit=20`
    );
    const papers = data.recommendedPapers ?? [];
    paperCache.set(cacheKey, papers);
    return papers;
  } catch {
    return [];
  }
}

/**
 * Batch recommendations for a set of papers.
 * Uses POST /recommendations/v1/papers/ which accepts up to 100 paper IDs and
 * returns a single merged set — one API call instead of one per paper.
 */
export async function getRecommendationsForSet(paperIds: string[]): Promise<SSPaper[]> {
  if (paperIds.length === 0) return [];
  const cacheKey = `recs-set:${[...paperIds].sort().join(',')}`;
  if (paperCache.has(cacheKey)) return paperCache.get(cacheKey)!;

  try {
    const res = await fetch(
      `https://api.semanticscholar.org/recommendations/v1/papers/?fields=${PAPER_FIELDS}&limit=50`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positivePaperIds: paperIds.slice(0, 100), negativePaperIds: [] }),
      }
    );
    if (!res.ok) throw new Error(`SS recommendations error: ${res.status}`);
    const data = await res.json() as { recommendedPapers?: SSPaper[] };
    const papers = data.recommendedPapers ?? [];
    paperCache.set(cacheKey, papers);
    return papers;
  } catch {
    return [];
  }
}
