import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CODEX_PAGE_SIZE, fetchCodexTopicSuggestions, fetchCodexVaultsPage } from './codexVaults';

const clientReturning = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, client: { rpc } as unknown as SupabaseClient };
};

describe('fetchCodexVaultsPage', () => {
  it('asks for the first page of every public vault by default', async () => {
    const page = { vaults: [], total: 0, next: null, categories: [] };
    const { rpc, client } = clientReturning(page);

    await expect(fetchCodexVaultsPage(client)).resolves.toBe(page);
    expect(rpc).toHaveBeenCalledWith('get_codex_vaults', {
      p_search: null,
      p_category: null,
      p_limit: CODEX_PAGE_SIZE,
      p_after_updated_at: null,
      p_after_id: null,
    });
  });

  it('passes the search, category and cursor through', async () => {
    const { rpc, client } = clientReturning({ vaults: [], total: 0, next: null, categories: null });

    await fetchCodexVaultsPage(client, {
      search: 'graph',
      category: 'Mathematics',
      limit: 2,
      after: { updated_at: '2026-11-20T10:00:00.123456+00:00', id: 'vault-9' },
    });
    expect(rpc).toHaveBeenCalledWith('get_codex_vaults', {
      p_search: 'graph',
      p_category: 'Mathematics',
      p_limit: 2,
      p_after_updated_at: '2026-11-20T10:00:00.123456+00:00',
      p_after_id: 'vault-9',
    });
  });

  it('throws the error when the call fails', async () => {
    const { client } = clientReturning(null, { message: 'boom' });
    await expect(fetchCodexVaultsPage(client)).rejects.toEqual({ message: 'boom' });
  });
});

describe('fetchCodexTopicSuggestions', () => {
  it('asks for the most common topics containing the query', async () => {
    const suggestions = [{ topic: 'graph drawing', papers: 4 }];
    const { rpc, client } = clientReturning(suggestions);

    await expect(fetchCodexTopicSuggestions(client, 'graph')).resolves.toEqual(suggestions);
    expect(rpc).toHaveBeenCalledWith('get_codex_topics', { p_query: 'graph', p_limit: 12 });
  });

  it('sends no query for an empty search', async () => {
    const { rpc, client } = clientReturning([]);
    await fetchCodexTopicSuggestions(client, '');
    expect(rpc).toHaveBeenCalledWith('get_codex_topics', { p_query: null, p_limit: 12 });
  });
});
