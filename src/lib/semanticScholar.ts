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

export interface SemanticScholarMetadata {
  title: string;
  authors: string[] | { name?: string | null }[];
  year?: number;
  journal?: string;
  venue?: string;
  doi: string;
  url?: string;
  abstract?: string;
  type?: string;
  publication_type?: string;
}

interface SemanticScholarErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown> | string;
  } | null;
  message?: string;
  details?: Record<string, unknown> | string;
  meta?: {
    request_id?: string;
  } | null;
}

export interface SemanticScholarRequestError extends Error {
  code: string;
  status: number;
  retryAfterSeconds: number | null;
  requestId: string | null;
  details?: Record<string, unknown> | string;
}

export interface SemanticScholarQueueProgress {
  completed: number;
  total: number;
  active: number;
  succeeded: number;
  failed: number;
  rateLimited: number;
}

export interface SemanticScholarQueueResult<TItem, TResult> {
  item: TItem;
  ok: boolean;
  data?: TResult;
  error?: SemanticScholarRequestError;
}

interface SemanticScholarQueueOptions {
  concurrency?: number;
  minDelayMs?: number;
  onProgress?: (progress: SemanticScholarQueueProgress) => void;
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

function createSemanticScholarRequestError(
  message: string,
  options: {
    code?: string;
    status: number;
    retryAfterSeconds?: number | null;
    requestId?: string | null;
    details?: Record<string, unknown> | string;
  },
): SemanticScholarRequestError {
  const error = new Error(message) as SemanticScholarRequestError;
  error.name = 'SemanticScholarRequestError';
  error.code = options.code || 'semantic_scholar_error';
  error.status = options.status;
  error.retryAfterSeconds = options.retryAfterSeconds ?? null;
  error.requestId = options.requestId ?? null;
  error.details = options.details;
  return error;
}

function getRetryAfterSecondsFromHeader(value: string | null): number | null {
  if (!value) return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.max(0, Math.ceil(numeric));
  }

  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return null;

  const diffMs = dateMs - Date.now();
  return diffMs > 0 ? Math.max(1, Math.ceil(diffMs / 1000)) : 0;
}

function getRetryAfterSecondsFromPayload(payload: SemanticScholarErrorPayload | null): number | null {
  const details = payload?.error?.details ?? payload?.details;
  if (!details || typeof details !== 'object') return null;

  const retryAfterSeconds = (details as { retry_after_seconds?: unknown }).retry_after_seconds;
  return typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds)
    ? Math.max(0, Math.ceil(retryAfterSeconds))
    : null;
}

function getRequestIdFromPayload(payload: SemanticScholarErrorPayload | null): string | null {
  const requestId = payload?.meta?.request_id;
  return typeof requestId === 'string' && requestId.trim().length > 0 ? requestId.trim() : null;
}

export function isSemanticScholarRequestError(error: unknown): error is SemanticScholarRequestError {
  return error instanceof Error && 'code' in error && 'status' in error;
}

export function isSemanticScholarRateLimitError(error: unknown): error is SemanticScholarRequestError {
  return isSemanticScholarRequestError(error)
    && (error.status === 429 || error.code === 'semantic_scholar_rate_limited' || error.code === 'rate_limit_exceeded');
}

function normalizeSemanticScholarError(
  payload: SemanticScholarErrorPayload | null,
  response: Response,
): SemanticScholarRequestError {
  const status = response.status;
  const retryAfterSeconds =
    getRetryAfterSecondsFromPayload(payload) ?? getRetryAfterSecondsFromHeader(response.headers.get('retry-after'));
  const baseMessage =
    payload?.error?.message ||
    (typeof payload?.error?.details === 'string' ? payload.error.details : '') ||
    payload?.message ||
    (typeof payload?.details === 'string' ? payload.details : '') ||
    `Semantic Scholar request failed (${status})`;
  const message = retryAfterSeconds != null && retryAfterSeconds > 0
    ? `${baseMessage} Retry in about ${retryAfterSeconds}s.`
    : baseMessage;

  return createSemanticScholarRequestError(message, {
    code:
      payload?.error?.code ||
      (status === 429 ? 'semantic_scholar_rate_limited' : 'semantic_scholar_error'),
    status,
    retryAfterSeconds,
    requestId: getRequestIdFromPayload(payload),
    details: payload?.error?.details ?? payload?.details,
  });
}

function normalizeUnknownSemanticScholarError(error: unknown): SemanticScholarRequestError {
  if (isSemanticScholarRequestError(error)) return error;
  if (error instanceof Error) {
    return createSemanticScholarRequestError(error.message, {
      code: 'semantic_scholar_error',
      status: 500,
    });
  }

  return createSemanticScholarRequestError('Semantic Scholar request failed.', {
    code: 'semantic_scholar_error',
    status: 500,
  });
}

export function formatSemanticScholarErrorMessage(error: unknown, fallback = 'Semantic Scholar request failed.'): string {
  if (isSemanticScholarRequestError(error)) {
    const retryHint = error.retryAfterSeconds && error.retryAfterSeconds > 0
      ? ` Retry in about ${error.retryAfterSeconds}s or rerun once the shared limit clears.`
      : ' Please wait a moment, then rerun the request.';

    if (isSemanticScholarRateLimitError(error)) {
      const separator = /[.!?]$/.test(error.message.trim()) ? '' : '.';
      return error.message.includes('Retry in about')
        ? `${error.message}${separator} You can rerun after the shared limit clears.`
        : `${error.message}${separator}${retryHint}`;
    }

    return error.message;
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

function normalizeMetadataAuthors(authors: SemanticScholarMetadata['authors'] | undefined | null): string[] {
  if (!Array.isArray(authors)) return [];

  return authors
    .map((author) => {
      if (typeof author === 'string') return author.trim();
      return author.name?.trim() || '';
    })
    .filter((author) => author.length > 0);
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

async function parseResponsePayload(response: Response): Promise<SemanticScholarErrorPayload | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchWithSemanticScholarError(path: string, init: RequestInit): Promise<SemanticScholarErrorPayload | null> {
  const response = await fetch(getSemanticScholarProxyUrl(path), init);
  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    throw normalizeSemanticScholarError(payload, response);
  }

  return payload;
}

async function paceQueue(schedule: { nextStartAt: number }, minDelayMs: number) {
  if (minDelayMs <= 0) return;

  const waitMs = Math.max(0, schedule.nextStartAt - Date.now());
  schedule.nextStartAt = Math.max(schedule.nextStartAt, Date.now()) + minDelayMs;

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

export async function runSemanticScholarQueue<TItem, TResult>(
  items: TItem[],
  worker: (item: TItem, index: number) => Promise<TResult>,
  options: SemanticScholarQueueOptions = {},
): Promise<SemanticScholarQueueResult<TItem, TResult>[]> {
  if (items.length === 0) return [];

  const concurrency = Math.max(1, options.concurrency ?? 2);
  const minDelayMs = Math.max(0, options.minDelayMs ?? 350);
  const results = new Array<SemanticScholarQueueResult<TItem, TResult>>(items.length);
  const progress: SemanticScholarQueueProgress = {
    completed: 0,
    total: items.length,
    active: 0,
    succeeded: 0,
    failed: 0,
    rateLimited: 0,
  };
  const schedule = { nextStartAt: Date.now() };
  let nextIndex = 0;

  const emitProgress = () => {
    options.onProgress?.({ ...progress });
  };

  emitProgress();

  const runWorker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) return;

      progress.active += 1;
      emitProgress();

      await paceQueue(schedule, minDelayMs);

      try {
        const data = await worker(items[index], index);
        results[index] = {
          item: items[index],
          ok: true,
          data,
        };
        progress.succeeded += 1;
      } catch (error) {
        const normalizedError = normalizeUnknownSemanticScholarError(error);
        results[index] = {
          item: items[index],
          ok: false,
          error: normalizedError,
        };
        progress.failed += 1;
        if (isSemanticScholarRateLimitError(normalizedError)) {
          progress.rateLimited += 1;
        }
      } finally {
        progress.active -= 1;
        progress.completed += 1;
        emitProgress();
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

async function lookupPaperIdFromBackend(input: { doi?: string; title?: string }): Promise<string | null> {
  const accessToken = await getAccessToken();
  const payload = await fetchWithSemanticScholarError('/lookup', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const paperId =
    (payload as { data?: { paper_id?: unknown; paperId?: unknown } | null } | null)?.data?.paper_id ??
    (payload as { data?: { paperId?: unknown } | null } | null)?.data?.paperId ??
    null;

  return typeof paperId === 'string' && paperId.trim().length > 0 ? paperId : null;
}

async function fetchPaperListFromBackend(
  route: 'references' | 'citations',
  paperId: string,
  limit: number,
): Promise<SSPaper[]> {
  const accessToken = await getAccessToken();
  const payload = await fetchWithSemanticScholarError(`/${route}`, {
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

  const records = Array.isArray((payload as { data?: unknown } | null)?.data)
    ? ((payload as { data: BackendPaper[] }).data ?? [])
    : [];

  return records.map(normalizePaper).filter((paper): paper is SSPaper => paper !== null);
}

// The backend's recommendations route accepts a whole batch of seed paper ids
// in one request (Semantic Scholar's own recommendations endpoint supports
// multiple positivePaperIds natively) -- so "find related papers" for a
// vault's worth of papers costs one upstream call per
// MAX_RECOMMENDATION_SEED_IDS_PER_REQUEST seed papers (see
// getRecommendationsForSet's chunking below), instead of one per paper.
const MAX_RECOMMENDATION_SEED_IDS_PER_REQUEST = 20;

async function fetchRecommendationsFromBackend(paperIds: string[], limit: number): Promise<SSPaper[]> {
  const accessToken = await getAccessToken();
  const payload = await fetchWithSemanticScholarError('/recommendations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paper_ids: paperIds, limit }),
  });

  const records = Array.isArray((payload as { data?: unknown } | null)?.data)
    ? ((payload as { data: BackendPaper[] }).data ?? [])
    : [];

  return records.map(normalizePaper).filter((paper): paper is SSPaper => paper !== null);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function searchPapersByTopic(query: string, limit = 20): Promise<SSPaper[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];

  const cacheKey = `search:${cleanQuery.toLowerCase()}:${limit}`;
  if (paperCache.has(cacheKey)) return paperCache.get(cacheKey)!;

  const accessToken = await getAccessToken();
  const payload = await fetchWithSemanticScholarError('/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: cleanQuery, limit }),
  });

  const records = Array.isArray((payload as { data?: unknown } | null)?.data)
    ? ((payload as { data: BackendPaper[] }).data ?? [])
    : [];
  const papers = records.map(normalizePaper).filter((paper): paper is SSPaper => paper !== null);
  paperCache.set(cacheKey, papers);
  return papers;
}

export async function lookupPaperByDOI(doi: string): Promise<string | null> {
  return lookupPaperIdFromBackend({ doi });
}

export async function lookupPaperByTitle(title: string): Promise<string | null> {
  return lookupPaperIdFromBackend({ title });
}

export async function getReferences(paperId: string): Promise<SSPaper[]> {
  const cacheKey = `refs:${paperId}`;
  if (paperCache.has(cacheKey)) return paperCache.get(cacheKey)!;

  const papers = await fetchPaperListFromBackend('references', paperId, 25);
  paperCache.set(cacheKey, papers);
  return papers;
}

export async function getCitations(paperId: string): Promise<SSPaper[]> {
  const cacheKey = `cites:${paperId}`;
  if (paperCache.has(cacheKey)) return paperCache.get(cacheKey)!;

  const papers = await fetchPaperListFromBackend('citations', paperId, 25);
  paperCache.set(cacheKey, papers);
  return papers;
}

export async function getRecommendations(paperId: string): Promise<SSPaper[]> {
  const cacheKey = `recs:${paperId}`;
  if (paperCache.has(cacheKey)) return paperCache.get(cacheKey)!;

  const papers = await fetchRecommendationsFromBackend([paperId], 20);
  paperCache.set(cacheKey, papers);
  return papers;
}

export async function getRecommendationsForSet(paperIds: string[]): Promise<SSPaper[]> {
  if (paperIds.length === 0) return [];

  const dedupedPaperIds = [...new Set(paperIds)].filter(Boolean);
  const cacheKey = `recs-set:${[...dedupedPaperIds].sort().join(',')}`;
  if (paperCache.has(cacheKey)) return paperCache.get(cacheKey)!;

  // The backend caps a single batch at MAX_RECOMMENDATION_SEED_IDS_PER_REQUEST
  // seed papers, so a vault larger than that still needs more than one call --
  // but far fewer than one per paper.
  const seedChunks = chunk(dedupedPaperIds, MAX_RECOMMENDATION_SEED_IDS_PER_REQUEST);
  const recommendationSets = await runSemanticScholarQueue(
    seedChunks,
    (seedChunk) => fetchRecommendationsFromBackend(seedChunk, 20),
    // Each request already batches up to 20 seeds and the backend enforces
    // its own global rate limit, so the queue's default inter-request delay
    // (meant for the old one-request-per-paper pattern) is unnecessary here.
    { minDelayMs: 0 },
  );

  const merged = new Map<string, SSPaper>();
  for (const result of recommendationSets) {
    if (!result.ok || !result.data) continue;

    for (const paper of result.data) {
      if (!merged.has(paper.paperId)) {
        merged.set(paper.paperId, paper);
      }
    }
  }

  // Only throw when every chunk failed -- checking merged.size here instead
  // would also throw when a chunk legitimately returned zero recommendations
  // alongside another chunk that failed, even though that first chunk did
  // succeed. A partial failure across chunks still returns whatever
  // succeeded (even an empty list) instead of discarding it.
  const anyChunkSucceeded = recommendationSets.some((result) => result.ok);
  if (!anyChunkSucceeded) {
    const firstError = recommendationSets.find((result) => !result.ok)?.error;
    if (firstError) {
      throw firstError;
    }
  }

  const papers = [...merged.values()];
  paperCache.set(cacheKey, papers);
  return papers;
}

export async function fetchSemanticScholarMetadataByDoi(doi: string): Promise<SemanticScholarMetadata | null> {
  const cleanDoi = doi.trim().replace(/^doi:/i, '');
  if (!cleanDoi) return null;

  const accessToken = await getAccessToken();
  const payload = await fetchWithSemanticScholarError('/doi-metadata', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ doi: cleanDoi }),
  });

  const metadata = (payload as { data?: SemanticScholarMetadata | null } | null)?.data ?? null;
  if (!metadata) return null;

  return {
    ...metadata,
    title: metadata.title?.trim() || '',
    authors: normalizeMetadataAuthors(metadata.authors),
    journal: metadata.journal || metadata.venue || undefined,
    type: metadata.type || metadata.publication_type || undefined,
    doi: metadata.doi || cleanDoi,
  };
}
