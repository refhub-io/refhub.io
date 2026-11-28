import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Publication, PublicationTag } from '@/types/database';
import { createVaultContentEdits } from '@/lib/vaultContentEdits';

const inserted: Record<string, unknown[]> = {};
const updated: Record<string, { value: unknown; filters: unknown[][] }[]> = {};
// What a delete answers with; set by a test that needs it to fail.
const deleteResult: { error: unknown } = { error: null };
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
      delete: () => ({ eq: () => Promise.resolve(deleteResult) }),
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
    const edits = createVaultContentEdits({
      publications: (update) => { state = update(state); },
      tags: () => {},
      publicationTags: () => {},
    });
    const { result } = renderHook(() => useSharedVaultOperations({
      vaultId: 'vault-1', userId: 'user-1', canEdit: true,
      publications: state, tags: [], publicationTags: [], edits,
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
    const edits = createVaultContentEdits({
      publications: (update) => { state = update(state); },
      tags: () => {},
      publicationTags: () => {},
    });
    const { result, rerender } = renderHook(() => useSharedVaultOperations({
      vaultId: 'vault-1', userId: 'user-1', canEdit: true,
      publications: state, tags: [], publicationTags: [], edits,
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

  it('shows a placeholder built by the same mapping until the inserted row arrives', async () => {
    const edits = {
      ...createVaultContentEdits({ publications: () => {}, tags: () => {}, publicationTags: () => {} }),
      addPublication: vi.fn(),
    };
    const { result } = renderHook(() => useSharedVaultOperations({
      vaultId: 'vault-1', userId: 'user-1', canEdit: true,
      publications: [], tags: [], publicationTags: [], edits,
    }));

    await act(async () => {
      await result.current.createVaultPublication({ title: 'A Paper', authors: ['Ada Lovelace'] });
    });

    const [placeholder] = edits.addPublication.mock.calls[0] as [Publication];
    expect(placeholder.id).toMatch(/^temp_/);
    expect(placeholder).toMatchObject({
      title: 'A Paper', authors: ['Ada Lovelace'], user_id: 'user-1', publication_type: 'article',
      reading_state: 'unread', important: false, section_id: null, section_position: 0,
    });
  });
});

describe('useSharedVaultOperations rollbacks', () => {
  beforeEach(() => { deleteResult.error = null; });

  // Rollbacks used to restore a snapshot of the whole list, taken before the operation: whatever
  // realtime delivered in the meantime vanished with it.
  it('puts back only what a failed delete removed', async () => {
    const paper = (id: string) => ({ id, title: id }) as Publication;
    const state = {
      publications: [paper('vp-a'), paper('vp-b')],
      publicationTags: [{ id: 'l1', vault_publication_id: 'vp-a', publication_id: null, tag_id: 't1' }] as PublicationTag[],
    };
    const edits = createVaultContentEdits({
      publications: (update) => { state.publications = update(state.publications); },
      tags: () => {},
      publicationTags: (update) => { state.publicationTags = update(state.publicationTags); },
    });
    deleteResult.error = { message: 'permission denied' };
    const { result } = renderHook(() => useSharedVaultOperations({
      vaultId: 'vault-1', userId: 'user-1', canEdit: true,
      publications: state.publications, tags: [], publicationTags: state.publicationTags, edits,
    }));

    await act(async () => {
      const deleting = result.current.deleteVaultPublication('vp-a');
      // Meanwhile, realtime brings in someone else's new paper.
      edits.addPublication(paper('vp-c'));
      await deleting;
    });

    expect(state.publications.map((p) => p.id).sort()).toEqual(['vp-a', 'vp-b', 'vp-c']);
    expect(state.publicationTags.map((l) => l.id)).toEqual(['l1']);
  });
});
