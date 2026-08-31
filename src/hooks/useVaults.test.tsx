import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuth } from './useAuth';
import { useVaults, useInvalidateVaults, vaultsQueryKey } from './useVaults';
import { fetchUserVaults } from '@/lib/vaults';
import type { Vault } from '@/types/database';

vi.mock('./useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/vaults', () => ({ fetchUserVaults: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const mockedUseAuth = vi.mocked(useAuth);
const mockedFetchUserVaults = vi.mocked(fetchUserVaults);

const ownedVault: Vault = {
  id: 'vault-1', user_id: 'user-1', name: 'Owned', description: null,
  color: '#fff', visibility: 'private', public_slug: null, category: null,
  abstract: null, created_at: 'now', updated_at: 'now',
};
const sharedVault: Vault = {
  id: 'vault-2', user_id: 'user-2', name: 'Shared', description: null,
  color: '#000', visibility: 'private', public_slug: null, category: null,
  abstract: null, created_at: 'now', updated_at: 'now',
};

function makeWrapper() {
  // Mirrors src/lib/queryClient.ts's real staleTime, since that's what
  // actually prevents redundant refetches across mounts in production.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useVaults', () => {
  beforeEach(() => {
    mockedFetchUserVaults.mockReset();
  });

  it('returns an empty, non-loading result when no user is signed in', async () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: false } as ReturnType<typeof useAuth>);
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useVaults(), { wrapper });

    expect(result.current.vaults).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockedFetchUserVaults).not.toHaveBeenCalled();
  });

  it('merges owned and shared vaults once the query resolves', async () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1', email: 'a@b.com' }, loading: false } as ReturnType<typeof useAuth>);
    mockedFetchUserVaults.mockResolvedValue({
      ownedVaults: [ownedVault],
      sharedVaults: [sharedVault],
      sharedVaultIds: ['vault-2'],
      scopedVaultIds: ['vault-1', 'vault-2'],
    });
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useVaults(), { wrapper });
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.vaults.map((v) => v.id)).toEqual(['vault-1', 'vault-2']);
    expect(result.current.ownedVaults).toEqual([ownedVault]);
    expect(result.current.sharedVaults).toEqual([sharedVault]);
  });

  it('useInvalidateVaults() marks the cached query for this user stale', async () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1', email: 'a@b.com' }, loading: false } as ReturnType<typeof useAuth>);
    mockedFetchUserVaults.mockResolvedValue({
      ownedVaults: [ownedVault], sharedVaults: [], sharedVaultIds: [], scopedVaultIds: ['vault-1'],
    });
    const { wrapper, queryClient } = makeWrapper();

    const { result } = renderHook(
      () => ({ vaults: useVaults(), invalidate: useInvalidateVaults() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.vaults.loading).toBe(false));
    expect(mockedFetchUserVaults).toHaveBeenCalledTimes(1);

    mockedFetchUserVaults.mockResolvedValue({
      ownedVaults: [ownedVault, { ...ownedVault, id: 'vault-3', name: 'New' }],
      sharedVaults: [], sharedVaultIds: [], scopedVaultIds: ['vault-1', 'vault-3'],
    });
    await result.current.invalidate();

    await waitFor(() => expect(mockedFetchUserVaults).toHaveBeenCalledTimes(2));
    expect(queryClient.getQueryState(vaultsQueryKey('user-1'))?.isInvalidated).toBe(false);
  });
});
