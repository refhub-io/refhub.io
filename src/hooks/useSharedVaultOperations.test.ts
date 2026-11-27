import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Publication } from '@/types/database';

const inserted: Record<string, unknown[]> = {};
const updated: Record<string, { value: unknown; filters: unknown[][] }[]> = {};
const rows: Record<string, Record<string, unknown>> = {
  publications: { id: 'pub-1', title: 'A Paper', user_id: 'user-1' },
  vault_publications: {
    id: 'vp-1', vault_id: 'vault-1', original_publication_id: 'pub-1', title: 'A Paper', authors: ['Ada Lovelace'],
    created_by: 'user-1', section_id: null, section_position: 0, featured: false, featured_note: null,
    created_at: '2026-11-27T00:00:00Z', updated_at: '2026-11-27T00:00:00Z',
  },
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (value: unknown) => {
        (inserted[table] ||= []).push(value);
        return { select: () => ({ single: () => Promise.resolve({ data: rows[table], error: null }) }) };
      },
      update: (value: unknown) => {
        const call = { value, filters: [] as unknown[][] };
        (updated[table] ||= []).push(call);
        const chain = {
          eq: (column: string, v: unknown) => { call.filters.push(['eq', column, v]); return chain; },
          neq: (column: string, v: unknown) => { call.filters.push(['neq', column, v]); return chain; },
          then: (resolve: (result: { error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(resolve, reject),
        };
        return chain;
      },
    }),
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { useSharedVaultOperations } from './useSharedVaultOperations';

describe('useSharedVaultOperations.createVaultPublication', () => {
  beforeEach(() => {
    for (const record of [inserted, updated]) for (const table of Object.keys(record)) delete record[table];
  });

  it('puts the full row in state, including the canonical id and section fields', async () => {
    let state: Publication[] = [];
    const setPublications = vi.fn((update: Publication[] | ((prev: Publication[]) => Publication[])) => {
      state = typeof update === 'function' ? update(state) : update;
    });
    const { result } = renderHook(() => useSharedVaultOperations({
      vaultId: 'vault-1', userId: 'user-1', canEdit: true,
      publications: state, setPublications,
      tags: [], setTags: vi.fn(), publicationTags: [], setPublicationTags: vi.fn(),
    }));

    let outcome: Awaited<ReturnType<typeof result.current.createVaultPublication>> | undefined;
    await act(async () => {
      outcome = await result.current.createVaultPublication({ title: 'A Paper', authors: ['Ada Lovelace'] });
    });

    expect(outcome?.success).toBe(true);
    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({
      id: 'vp-1',
      original_publication_id: 'pub-1',
      section_id: null,
      section_position: 0,
      featured: false,
      featured_note: null,
    });
    expect(inserted.vault_publications?.[0]).toMatchObject({ vault_id: 'vault-1', original_publication_id: 'pub-1' });
  });

  // #252: the paper in state had no original_publication_id, so its first edit skipped the
  // canonical copy.
  it('syncs the first edit of a paper created in this session to its canonical copy', async () => {
    let state: Publication[] = [];
    const setPublications = vi.fn((update: Publication[] | ((prev: Publication[]) => Publication[])) => {
      state = typeof update === 'function' ? update(state) : update;
    });
    const { result, rerender } = renderHook(() => useSharedVaultOperations({
      vaultId: 'vault-1', userId: 'user-1', canEdit: true,
      publications: state, setPublications,
      tags: [], setTags: vi.fn(), publicationTags: [], setPublicationTags: vi.fn(),
    }));

    await act(async () => {
      await result.current.createVaultPublication({ title: 'A Paper', authors: ['Ada Lovelace'] });
    });
    rerender();
    let outcome: Awaited<ReturnType<typeof result.current.updateVaultPublication>> | undefined;
    await act(async () => {
      outcome = await result.current.updateVaultPublication('vp-1', { title: 'A Better Title' });
    });

    expect(outcome?.success).toBe(true);
    expect(updated.publications).toEqual([
      { value: expect.objectContaining({ title: 'A Better Title' }), filters: [['eq', 'id', 'pub-1']] },
    ]);
  });
});
