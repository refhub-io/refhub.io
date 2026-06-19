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
