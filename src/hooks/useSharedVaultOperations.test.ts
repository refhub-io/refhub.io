import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Publication } from '@/types/database';

const inserted: Record<string, unknown[]> = {};
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
    }),
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { useSharedVaultOperations } from './useSharedVaultOperations';

describe('useSharedVaultOperations.createVaultPublication', () => {
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
});
