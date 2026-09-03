import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Vault } from '@/types/database';
import { getVaultFavoritesOrderStorageKey, useVaultFavoritesOrder } from './useVaultFavoritesOrder';

function makeVault(id: string, name: string): Vault {
  return {
    id,
    user_id: 'user-1',
    name,
    description: null,
    color: '#6366f1',
    visibility: 'private',
    public_slug: null,
    category: null,
    abstract: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const vaults = [makeVault('a', 'Alpha'), makeVault('b', 'Beta'), makeVault('c', 'Gamma')];

describe('useVaultFavoritesOrder', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns favorites in their natural order when nothing is stored', () => {
    const { result } = renderHook(() => useVaultFavoritesOrder('user-1'));
    expect(result.current.orderFavorites(vaults).map(v => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('loads a previously persisted order for the given user', () => {
    localStorage.setItem(getVaultFavoritesOrderStorageKey('user-1'), JSON.stringify(['c', 'a', 'b']));

    const { result } = renderHook(() => useVaultFavoritesOrder('user-1'));
    expect(result.current.orderFavorites(vaults).map(v => v.id)).toEqual(['c', 'a', 'b']);
  });

  it('moving a favorite persists the new order and reflects it immediately', () => {
    const { result } = renderHook(() => useVaultFavoritesOrder('user-1'));

    act(() => {
      result.current.reorder(vaults, 'c', 'a');
    });

    expect(result.current.orderFavorites(vaults).map(v => v.id)).toEqual(['c', 'a', 'b']);

    const stored = JSON.parse(localStorage.getItem(getVaultFavoritesOrderStorageKey('user-1')) || '[]');
    expect(stored).toEqual(['c', 'a', 'b']);
  });

  it('keeps a separate order from the owned-vaults order for the same user', () => {
    localStorage.setItem('refhub_vault_sidebar_order_v1:user-1', JSON.stringify(['c', 'b', 'a']));

    const { result } = renderHook(() => useVaultFavoritesOrder('user-1'));
    expect(result.current.orderFavorites(vaults).map(v => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps separate orders per user', () => {
    localStorage.setItem(getVaultFavoritesOrderStorageKey('user-1'), JSON.stringify(['c', 'a', 'b']));
    localStorage.setItem(getVaultFavoritesOrderStorageKey('user-2'), JSON.stringify(['b', 'c', 'a']));

    const { result: resultUser1 } = renderHook(() => useVaultFavoritesOrder('user-1'));
    const { result: resultUser2 } = renderHook(() => useVaultFavoritesOrder('user-2'));

    expect(resultUser1.current.orderFavorites(vaults).map(v => v.id)).toEqual(['c', 'a', 'b']);
    expect(resultUser2.current.orderFavorites(vaults).map(v => v.id)).toEqual(['b', 'c', 'a']);
  });

  it('does nothing when there is no signed-in user', () => {
    const { result } = renderHook(() => useVaultFavoritesOrder(null));

    act(() => {
      result.current.reorder(vaults, 'c', 'a');
    });

    expect(result.current.orderFavorites(vaults).map(v => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('picks up a stored order once userId becomes available after mount (auth resolving async)', async () => {
    localStorage.setItem(getVaultFavoritesOrderStorageKey('user-1'), JSON.stringify(['c', 'a', 'b']));

    const { result, rerender } = renderHook(
      ({ userId }: { userId: string | null | undefined }) => useVaultFavoritesOrder(userId),
      { initialProps: { userId: undefined } },
    );
    expect(result.current.orderFavorites(vaults).map((v) => v.id)).toEqual(['a', 'b', 'c']);

    rerender({ userId: 'user-1' });

    await waitFor(() => {
      expect(result.current.orderFavorites(vaults).map((v) => v.id)).toEqual(['c', 'a', 'b']);
    });
  });
});
