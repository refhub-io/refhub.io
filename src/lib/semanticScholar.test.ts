import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/lib/apiKeys', () => ({
  getBackendApiBaseUrl: () => 'https://refhub.test',
}));

import { supabase } from '@/integrations/supabase/client';
import {
  fetchSemanticScholarMetadataByDoi,
  formatSemanticScholarErrorMessage,
  getRecommendations,
  getRecommendationsForSet,
  runSemanticScholarQueue,
  searchPapersByTopic,
  type SemanticScholarQueueProgress,
  type SemanticScholarRequestError,
} from './semanticScholar';

const getSessionMock = vi.mocked(supabase.auth.getSession);

describe('semanticScholar', () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token',
        },
      },
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('captures retry timing from Retry-After headers', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'semantic_scholar_rate_limited',
            message: 'Semantic Scholar rate limit exceeded',
          },
        }),
        {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': '12',
          },
        },
      ),
    );

    await expect(fetchSemanticScholarMetadataByDoi('10.123/example')).rejects.toMatchObject({
      code: 'semantic_scholar_rate_limited',
      status: 429,
      retryAfterSeconds: 12,
    });
  });

  it('formats rate-limit errors with an actionable rerun hint', () => {
    const error = Object.assign(new Error('Semantic Scholar rate limit exceeded'), {
      code: 'semantic_scholar_rate_limited',
      status: 429,
      retryAfterSeconds: null,
      requestId: 'request-1',
    }) as SemanticScholarRequestError;

    expect(formatSemanticScholarErrorMessage(error)).toBe(
      'Semantic Scholar rate limit exceeded. Please wait a moment, then rerun the request.',
    );
  });

  it('searches papers by topic through the backend proxy', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              paper_id: 'paper-1',
              title: 'Topic Paper',
              authors: [{ name: 'Ada' }],
              year: 2025,
              venue: 'VIS',
              external_ids: { DOI: '10.123/topic' },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(searchPapersByTopic('visual analytics', 10)).resolves.toEqual([
      expect.objectContaining({
        paperId: 'paper-1',
        title: 'Topic Paper',
        externalIds: { DOI: '10.123/topic' },
      }),
    ]);
    expect(fetch).toHaveBeenCalledWith('https://refhub.test/search', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ query: 'visual analytics', limit: 10 }),
    }));
  });

  it('requests recommendations for a whole set of seed papers in a single call', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ paper_id: 'rec-1', title: 'Recommended' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const papers = await getRecommendationsForSet(['p1', 'p2', 'p1', 'p3']);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://refhub.test/recommendations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ paper_ids: ['p1', 'p2', 'p3'], limit: 20 }),
    }));
    expect(papers).toEqual([expect.objectContaining({ paperId: 'rec-1' })]);
  });

  it('honors a custom limit for recommendations across a seed set', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ paper_id: 'rec-1', title: 'Recommended' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await getRecommendationsForSet(['p1', 'p2'], 10);

    expect(fetch).toHaveBeenCalledWith('https://refhub.test/recommendations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ paper_ids: ['p1', 'p2'], limit: 10 }),
    }));
  });

  it('chunks recommendation requests once the seed set exceeds the batch cap', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ paper_id: 'rec-1', title: 'Recommended' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const manyIds = Array.from({ length: 25 }, (_, i) => `p${i}`);
    await getRecommendationsForSet(manyIds);

    expect(fetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    const secondBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    expect(firstBody.paper_ids).toHaveLength(20);
    expect(secondBody.paper_ids).toHaveLength(5);
  });

  it('returns the successful chunks instead of discarding everything when only some chunks fail', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ paper_id: 'rec-1', title: 'Recommended' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }),
      );

    const manyIds = Array.from({ length: 25 }, (_, i) => `partial-${i}`);
    const papers = await getRecommendationsForSet(manyIds);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(papers).toEqual([expect.objectContaining({ paperId: 'rec-1' })]);
  });

  it('does not throw when a succeeding chunk legitimately returns zero recommendations', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }),
      );

    const manyIds = Array.from({ length: 25 }, (_, i) => `empty-success-${i}`);
    await expect(getRecommendationsForSet(manyIds)).resolves.toEqual([]);
  });

  it('throws only when every chunk fails', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }),
    );

    const manyIds = Array.from({ length: 25 }, (_, i) => `allfail-${i}`);
    await expect(getRecommendationsForSet(manyIds)).rejects.toBeTruthy();
  });

  it('requests recommendations for a single paper via the same batched endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ paper_id: 'rec-1', title: 'Recommended' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await getRecommendations('p1');

    expect(fetch).toHaveBeenCalledWith('https://refhub.test/recommendations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ paper_ids: ['p1'], limit: 20 }),
    }));
  });

  it('runs queued tasks with bounded concurrency and progress updates', async () => {
    let active = 0;
    let maxActive = 0;
    const progressUpdates: SemanticScholarQueueProgress[] = [];

    const results = await runSemanticScholarQueue(
      [1, 2, 3, 4],
      async (item) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return item * 2;
      },
      {
        concurrency: 2,
        minDelayMs: 0,
        onProgress: (progress) => progressUpdates.push(progress),
      },
    );

    expect(maxActive).toBe(2);
    expect(results.map((result) => result.data)).toEqual([2, 4, 6, 8]);
    expect(progressUpdates.at(-1)).toMatchObject({
      completed: 4,
      total: 4,
      active: 0,
      succeeded: 4,
      failed: 0,
      rateLimited: 0,
    });
  });

  it('tracks rate-limited failures in queue progress', async () => {
    const progressUpdates: SemanticScholarQueueProgress[] = [];
    const rateLimitError = Object.assign(new Error('Retry in about 9s.'), {
      code: 'semantic_scholar_rate_limited',
      status: 429,
      retryAfterSeconds: 9,
      requestId: null,
    }) as SemanticScholarRequestError;

    const results = await runSemanticScholarQueue(
      ['ok', 'slow'],
      async (item) => {
        if (item === 'slow') throw rateLimitError;
        return item;
      },
      {
        concurrency: 2,
        minDelayMs: 0,
        onProgress: (progress) => progressUpdates.push(progress),
      },
    );

    expect(results[1]).toMatchObject({
      ok: false,
      error: {
        code: 'semantic_scholar_rate_limited',
        retryAfterSeconds: 9,
      },
    });
    expect(progressUpdates.at(-1)).toMatchObject({
      failed: 1,
      rateLimited: 1,
    });
  });
});
