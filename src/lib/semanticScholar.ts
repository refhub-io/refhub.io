const BASE_URL = 'https://api.semanticscholar.org/graph/v1';

const PAPER_FIELDS = 'paperId,title,authors,year,citationCount,externalIds';

export interface SSPaper {
  paperId: string;
  title: string;
  authors: { name: string }[];
  year: number | null;
  citationCount: number | null;
  externalIds: { DOI?: string } | null;
}

// In-memory cache keyed by paperId
const paperCache = new Map<string, SSPaper[]>();

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Semantic Scholar API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
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
