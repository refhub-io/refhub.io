import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Vault } from '@/types/database';
import { getVaultSharedOrderStorageKey, useVaultSharedOrder } from './useVaultSharedOrder';

function makeVault(id: string, name: string): Vault {
  return {
    id,
    user_id: 'owner-1',
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

describe('useVaultSharedOrder', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns shared vaults in their natural order when nothing is stored', () => {
    const { result } = renderHook(() => useVaultSharedOrder('user-1'));
    expect(result.current.orderShared(vaults).map(v => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('loads a previously persisted order for the given user', () => {
    localStorage.setItem(getVaultSharedOrderStorageKey('user-1'), JSON.stringify(['c', 'a', 'b']));

    const { result } = renderHook(() => useVaultSharedOrder('user-1'));
    expect(result.current.orderShared(vaults).map(v => v.id)).toEqual(['c', 'a', 'b']);
  });

  it('moving a shared vault persists the new order and reflects it immediately', () => {
    const { result } = renderHook(() => useVaultSharedOrder('user-1'));

    act(() => {
      result.current.reorder(vaults, 'c', 'a');
    });

    expect(result.current.orderShared(vaults).map(v => v.id)).toEqual(['c', 'a', 'b']);

    const stored = JSON.parse(localStorage.getItem(getVaultSharedOrderStorageKey('user-1')) || '[]');
    expect(stored).toEqual(['c', 'a', 'b']);
  });

  it('keeps a separate order from the owned-vaults and favorites orders for the same user', () => {
    localStorage.setItem('refhub_vault_sidebar_order_v1:user-1', JSON.stringify(['c', 'b', 'a']));
    localStorage.setItem('refhub_vault_favorites_order_v1:user-1', JSON.stringify(['b', 'a', 'c']));

    const { result } = renderHook(() => useVaultSharedOrder('user-1'));
    expect(result.current.orderShared(vaults).map(v => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps separate orders per user', () => {
    localStorage.setItem(getVaultSharedOrderStorageKey('user-1'), JSON.stringify(['c', 'a', 'b']));
    localStorage.setItem(getVaultSharedOrderStorageKey('user-2'), JSON.stringify(['b', 'c', 'a']));

    const { result: resultUser1 } = renderHook(() => useVaultSharedOrder('user-1'));
    const { result: resultUser2 } = renderHook(() => useVaultSharedOrder('user-2'));

    expect(resultUser1.current.orderShared(vaults).map(v => v.id)).toEqual(['c', 'a', 'b']);
    expect(resultUser2.current.orderShared(vaults).map(v => v.id)).toEqual(['b', 'c', 'a']);
  });

  it('does nothing when there is no signed-in user', () => {
    const { result } = renderHook(() => useVaultSharedOrder(null));

    act(() => {
      result.current.reorder(vaults, 'c', 'a');
    });

    expect(result.current.orderShared(vaults).map(v => v.id)).toEqual(['a', 'b', 'c']);
  });
});
