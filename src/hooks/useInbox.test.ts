import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useInbox } from './useInbox';

const mockItems = [
  { id: 'item-2', user_id: 'user-1', status: 'pending', source_type: 'doi', source_ref: '10.1/b',
    parsed_fields: { title: 'B' }, suggested_vault_id: null, suggested_tag_ids: null,
    duplicate_of_publication_id: null, filed_publication_id: null, sort_order: 0,
    created_at: '2026-01-02T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' },
  { id: 'item-1', user_id: 'user-1', status: 'pending', source_type: 'manual', source_ref: 'A',
    parsed_fields: { title: 'A' }, suggested_vault_id: null, suggested_tag_ids: null,
    duplicate_of_publication_id: null, filed_publication_id: null, sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
];

const mockUpdate = vi.fn().mockResolvedValue({ data: null, error: null });
const mockInsert = vi.fn();
let mockUpdateError: unknown = null;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'user@example.com' }, session: null }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const createChainable = () => ({
    select: vi.fn(function() { return this; }),
    eq: vi.fn(function() { return this; }),
    order: vi.fn(function() { return this; }),
    then: vi.fn(function(onFulfill) { return onFulfill({ data: mockItems, error: null }); }),
  });

  return {
    supabase: {
      from: (table: string) => {
        if (table !== 'inbox_items') throw new Error(`unexpected table ${table}`);
        return {
          select: vi.fn(function() { return this; }),
          eq: vi.fn(function() { return this; }),
          order: vi.fn(function() { return this; }),
          then: vi.fn(function(onFulfill) { return onFulfill({ data: mockItems, error: null }); }),
          insert: (...args: unknown[]) => {
            mockInsert(...args);
            return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({
              data: { ...mockItems[0], id: 'new-item', ...args[0][0] }, error: null,
            }) };
          },
          update: (...args: unknown[]) => {
            mockUpdate(...args);
            return {
              eq: vi.fn().mockResolvedValue({ data: null, error: mockUpdateError })
            };
          },
        };
      },
    },
  };
});

describe('useInbox', () => {
  beforeEach(() => { mockUpdate.mockClear(); mockInsert.mockClear(); });

  it('loads pending items ordered by sort_order then created_at', async () => {
    const { result } = renderHook(() => useInbox());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((i) => i.id)).toEqual(['item-2', 'item-1']);
  });

  it('acceptItem sets status=accepted and filed_publication_id', async () => {
    const { result } = renderHook(() => useInbox());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.acceptItem('item-1', 'vault-1', ['tag-1'], 'new-pub-id'); });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'accepted', filed_publication_id: 'new-pub-id' }),
    );
  });

  it('postponeItem bumps sort_order without changing status', async () => {
    const { result } = renderHook(() => useInbox());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.postponeItem('item-1'); });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ sort_order: expect.any(Number) }),
    );
    expect(mockUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
  });

  it('rejectItem does not remove item if update fails', async () => {
    const { result } = renderHook(() => useInbox());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const initialLength = result.current.items.length;

    // Set up the mock to return an error
    mockUpdateError = new Error('RLS policy violation');

    await act(async () => { await result.current.rejectItem('item-1'); });

    // Item should still be in the list
    expect(result.current.items.length).toBe(initialLength);
    expect(result.current.items.find((i) => i.id === 'item-1')).toBeDefined();
  });
});
