import { supabase } from '@/integrations/supabase/client';
import { getBackendApiBaseUrl } from '@/lib/apiKeys';

export interface SSPaper {
  paperId: string;
  title: string;
  authors: { name: string }[];
  year: number | null;
  venue: string | null;
  citationCount: number | null;
  externalIds: { DOI?: string } | null;
  abstract: string | null;
  url: string | null;
  openAccessPdfUrl: string | null;
}

interface BackendPaperAuthor {
  author_id?: string | null;
  authorId?: string | null;
  name?: string | null;
}

interface BackendPaper {
  paper_id?: string | null;
  paperId?: string | null;
  title?: string | null;
  authors?: BackendPaperAuthor[] | null;
  year?: number | null;
  venue?: string | null;
  citation_count?: number | null;
  citationCount?: number | null;
  external_ids?: { DOI?: string | null } | null;
  externalIds?: { DOI?: string | null } | null;
  abstract?: string | null;
  url?: string | null;
  open_access_pdf_url?: string | null;
  openAccessPdfUrl?: string | null;
}

// In-memory cache keyed by cache key
const paperCache = new Map<string, SSPaper[]>();

function getSemanticScholarProxyUrl(path: string) {
  return `${getBackendApiBaseUrl()}${path}`;
}

function normalizePaper(record: BackendPaper): SSPaper | null {
  const paperId = record.paper_id ?? record.paperId ?? null;
  const title = record.title?.trim() || null;

  if (!paperId || !title) return null;

  return {
    paperId,
    title,
    authors: Array.isArray(record.authors)
      ? record.authors
          .map((author) => ({ name: author.name?.trim() || '' }))
          .filter((author) => author.name.length > 0)
      : [],
    year: typeof record.year === 'number' ? record.year : null,
    venue: record.venue?.trim() || null,
    citationCount:
      typeof record.citation_count === 'number'
        ? record.citation_count
        : typeof record.citationCount === 'number'
          ? record.citationCount
          : null,
    externalIds:
      record.external_ids || record.externalIds
        ? {
            DOI: (record.external_ids?.DOI ?? record.externalIds?.DOI ?? undefined) || undefined,
          }
        : null,
    abstract: record.abstract ?? null,
    url: record.url ?? null,
    openAccessPdfUrl: record.open_access_pdf_url ?? record.openAccessPdfUrl ?? null,
  };
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error('No authenticated session available for Semantic Scholar requests.');
  }

  return accessToken;
}

function getErrorMessage(payload: unknown, status: number) {
  return (
    (payload as { error?: { message?: string; details?: string } } | null)?.error?.message ||
    (payload as { error?: { details?: string } } | null)?.error?.details ||
    (payload as { message?: string; details?: string } | null)?.message ||
    (payload as { details?: string } | null)?.details ||
    `Semantic Scholar request failed (${status})`
  );
}

async function lookupPaperIdFromBackend(input: { doi?: string; title?: string }): Promise<string | null> {
  const accessToken = await getAccessToken();
  const response = await fetch(getSemanticScholarProxyUrl('/lookup'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, response.status));
  }

  const paperId =
    (payload as { data?: { paper_id?: unknown; paperId?: unknown } | null } | null)?.data?.paper_id ??
    (payload as { data?: { paperId?: unknown } | null } | null)?.data?.paperId ??
    null;

  return typeof paperId === 'string' && paperId.trim().length > 0 ? paperId : null;
}

async function fetchPaperListFromBackend(
  route: 'recommendations' | 'references' | 'citations',
  paperId: string,
  limit: number,
): Promise<SSPaper[]> {
  const accessToken = await getAccessToken();
  const response = await fetch(getSemanticScholarProxyUrl(`/${route}`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paper_id: paperId,
      limit,
    }),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, response.status));
  }

  const records = Array.isArray((payload as { data?: unknown } | null)?.data)
    ? ((payload as { data: BackendPaper[] }).data ?? [])
    : [];

  return records.map(normalizePaper).filter((paper): paper is SSPaper => paper !== null);
}

export async function lookupPaperByDOI(doi: string): Promise<string | null> {
  try {
    return await lookupPaperIdFromBackend({ doi });
  } catch {
    return null;
  }
}

export async function lookupPaperByTitle(title: string): Promise<string | null> {
  try {
    return await lookupPaperIdFromBackend({ title });
  } catch {
    return null;
  }
}

export async function getReferences(paperId: string): Promise<SSPaper[]> {
  const cacheKey = `refs:${paperId}`;
  if (paperCache.has(cacheKey)) return paperCache.get(cacheKey)!;

  try {
    const papers = await fetchPaperListFromBackend('references', paperId, 25);
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
    const papers = await fetchPaperListFromBackend('citations', paperId, 25);
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
    const papers = await fetchPaperListFromBackend('recommendations', paperId, 20);
    paperCache.set(cacheKey, papers);
    return papers;
  } catch {
    return [];
  }
}

export async function getRecommendationsForSet(paperIds: string[]): Promise<SSPaper[]> {
  if (paperIds.length === 0) return [];

  const dedupedPaperIds = [...new Set(paperIds)].filter(Boolean);
  const cacheKey = `recs-set:${[...dedupedPaperIds].sort().join(',')}`;
  if (paperCache.has(cacheKey)) return paperCache.get(cacheKey)!;

  try {
    const recommendationSets = await Promise.all(
      dedupedPaperIds.map((paperId) => fetchPaperListFromBackend('recommendations', paperId, 20))
    );

    const merged = new Map<string, SSPaper>();
    for (const papers of recommendationSets) {
      for (const paper of papers) {
        if (!merged.has(paper.paperId)) {
          merged.set(paper.paperId, paper);
        }
      }
    }

    const papers = [...merged.values()];
    paperCache.set(cacheKey, papers);
    return papers;
  } catch {
    return [];
  }
}
