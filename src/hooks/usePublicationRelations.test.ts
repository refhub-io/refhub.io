import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { usePublicationRelations } from './usePublicationRelations';

const mockInsert = vi.fn();
const mockSelect = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'publication_relations') {
        return {
          select: () => ({ or: () => mockSelect() }),
          insert: (payload: unknown) => mockInsert(payload),
        };
      }
      if (table === 'vault_publications') {
        return { select: () => ({ in: () => ({ data: [], error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

describe('usePublicationRelations addRelation direction', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockSelect.mockReset();
    mockSelect.mockResolvedValue({ data: [], error: null });
    mockInsert.mockResolvedValue({ error: null });
  });

  it('defaults to outgoing: publication_id is the hook-bound id', async () => {
    const { result } = renderHook(() => usePublicationRelations('current', 'user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addRelation('other', 'cites');
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ publication_id: 'current', related_publication_id: 'other', relation_type: 'cites' }),
    );
  });

  it('direction "incoming" swaps publication_id and related_publication_id', async () => {
    const { result } = renderHook(() => usePublicationRelations('current', 'user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addRelation('other', 'cites', 'incoming');
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ publication_id: 'other', related_publication_id: 'current', relation_type: 'cites' }),
    );
  });
});
