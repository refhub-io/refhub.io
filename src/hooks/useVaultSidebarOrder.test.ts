import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Vault } from '@/types/database';
import { getVaultSidebarOrderStorageKey, useVaultSidebarOrder } from './useVaultSidebarOrder';

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

describe('useVaultSidebarOrder', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns vaults in their natural order when nothing is stored', () => {
    const { result } = renderHook(() => useVaultSidebarOrder('user-1'));
    expect(result.current.orderVaults(vaults).map(v => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('loads a previously persisted order for the given user', () => {
    localStorage.setItem(getVaultSidebarOrderStorageKey('user-1'), JSON.stringify(['c', 'a', 'b']));

    const { result } = renderHook(() => useVaultSidebarOrder('user-1'));
    expect(result.current.orderVaults(vaults).map(v => v.id)).toEqual(['c', 'a', 'b']);
  });

  it('moving a vault persists the new order and reflects it immediately', () => {
    const { result } = renderHook(() => useVaultSidebarOrder('user-1'));

    act(() => {
      result.current.reorder(vaults, 'c', 'a');
    });

    expect(result.current.orderVaults(vaults).map(v => v.id)).toEqual(['c', 'a', 'b']);

    const stored = JSON.parse(localStorage.getItem(getVaultSidebarOrderStorageKey('user-1')) || '[]');
    expect(stored).toEqual(['c', 'a', 'b']);
  });

  it('keeps separate orders per user', () => {
    localStorage.setItem(getVaultSidebarOrderStorageKey('user-1'), JSON.stringify(['c', 'a', 'b']));
    localStorage.setItem(getVaultSidebarOrderStorageKey('user-2'), JSON.stringify(['b', 'c', 'a']));

    const { result: resultUser1 } = renderHook(() => useVaultSidebarOrder('user-1'));
    const { result: resultUser2 } = renderHook(() => useVaultSidebarOrder('user-2'));

    expect(resultUser1.current.orderVaults(vaults).map(v => v.id)).toEqual(['c', 'a', 'b']);
    expect(resultUser2.current.orderVaults(vaults).map(v => v.id)).toEqual(['b', 'c', 'a']);
  });

  it('does nothing when there is no signed-in user', () => {
    const { result } = renderHook(() => useVaultSidebarOrder(null));

    act(() => {
      result.current.reorder(vaults, 'c', 'a');
    });

    expect(result.current.orderVaults(vaults).map(v => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('picks up a stored order once userId becomes available after mount (auth resolving async)', async () => {
    localStorage.setItem(getVaultSidebarOrderStorageKey('user-1'), JSON.stringify(['c', 'a', 'b']));

    // Sidebar mounts before useAuth() resolves on most pages, so this hook
    // is frequently first rendered with userId undefined.
    const { result, rerender } = renderHook(
      ({ userId }: { userId: string | null | undefined }) => useVaultSidebarOrder(userId),
      { initialProps: { userId: undefined } },
    );
    expect(result.current.orderVaults(vaults).map((v) => v.id)).toEqual(['a', 'b', 'c']);

    rerender({ userId: 'user-1' });

    await waitFor(() => {
      expect(result.current.orderVaults(vaults).map((v) => v.id)).toEqual(['c', 'a', 'b']);
    });
  });
});
