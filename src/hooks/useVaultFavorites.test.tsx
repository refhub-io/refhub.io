import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAuth } from './useAuth';
import { useVaultFavorites, vaultFavoritesQueryKey } from './useVaultFavorites';
import type { Vault, VaultFavorite } from '@/types/database';

vi.mock('./useAuth', () => ({ useAuth: vi.fn() }));
const mockedUseAuth = vi.mocked(useAuth);

const fakeUser = { id: 'user-1', email: 'a@b.com' } as User;

const vaultA: Vault = {
  id: 'va', user_id: 'owner-a', name: 'Vault A', description: null, color: '#fff',
  visibility: 'private', public_slug: null, category: null, abstract: null,
  created_at: 'now', updated_at: 'now',
};
const vaultB: Vault = {
  id: 'vb', user_id: 'owner-b', name: 'Vault B', description: null, color: '#000',
  visibility: 'private', public_slug: null, category: null, abstract: null,
  created_at: 'now', updated_at: 'now',
};
const favA: VaultFavorite = { id: 'f1', vault_id: 'va', user_id: 'user-1', created_at: 'now' };
const favB: VaultFavorite = { id: 'f2', vault_id: 'vb', user_id: 'user-1', created_at: 'now' };

let mutationLog: { table: string; op: string }[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const chain = {
        select: (_cols?: string) => chain,
        eq: (_col: string, _val: unknown) => chain,
        in: (col: string, ids: string[]) => {
          const rows = ((): unknown[] => {
            if (table === 'vault_favorites' && col === 'user_id') return [];
            if (table === 'vaults' && col === 'id') return [vaultA, vaultB].filter((v) => ids.includes(v.id));
            if (table === 'vault_publications' && col === 'vault_id') {
              return [{ vault_id: 'va' }, { vault_id: 'va' }, { vault_id: 'vb' }].filter((r) => ids.includes(r.vault_id));
            }
            if (table === 'profiles' && col === 'user_id') return [];
            return [];
          })() as Record<string, unknown>[];
          return Promise.resolve({ data: rows, error: null });
        },
        insert: (row: Record<string, unknown>) => {
          mutationLog.push({ table, op: 'insert' });
          return Promise.resolve({ data: row, error: null });
        },
        delete: () => ({
          eq: () => ({
            eq: () => {
              mutationLog.push({ table, op: 'delete' });
              return Promise.resolve({ data: null, error: null });
            },
          }),
        }),
      };
      if (table === 'vault_favorites') {
        return {
          select: () => ({
            eq: (_col: string, _val: unknown) => Promise.resolve({ data: [favA, favB], error: null }),
          }),
          insert: chain.insert,
          delete: chain.delete,
        };
      }
      return chain;
    },
  },
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useVaultFavorites', () => {
  beforeEach(() => {
    mutationLog = [];
  });

  it('returns empty, non-loading when no user is signed in', () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: false } as ReturnType<typeof useAuth>);
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useVaultFavorites(), { wrapper });

    expect(result.current.favoriteVaults).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('attributes publication counts to the correct favorited vault after batching', async () => {
    mockedUseAuth.mockReturnValue({ user: fakeUser, loading: false } as ReturnType<typeof useAuth>);
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useVaultFavorites(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const byId = Object.fromEntries(result.current.favoriteVaults.map((v) => [v.id, v]));
    expect(byId.va.publication_count).toBe(2);
    expect(byId.vb.publication_count).toBe(1);
    expect(result.current.isFavorite('va')).toBe(true);
    expect(result.current.isFavorite('vc')).toBe(false);
  });

  it('shares cached favorites across two hook instances for the same user', async () => {
    mockedUseAuth.mockReturnValue({ user: fakeUser, loading: false } as ReturnType<typeof useAuth>);
    const { wrapper, queryClient } = makeWrapper();

    const { result: first } = renderHook(() => useVaultFavorites(), { wrapper });
    await waitFor(() => expect(first.current.loading).toBe(false));

    const { result: second } = renderHook(() => useVaultFavorites(), { wrapper });
    expect(second.current.loading).toBe(false);
    expect(second.current.favoriteVaults).toEqual(first.current.favoriteVaults);
    expect(queryClient.getQueryData(vaultFavoritesQueryKey('user-1'))).toBeDefined();
  });

  it('toggleFavorite adds when not favorited', async () => {
    mockedUseAuth.mockReturnValue({ user: fakeUser, loading: false } as ReturnType<typeof useAuth>);
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useVaultFavorites(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleFavorite('vc');
    });

    expect(mutationLog).toEqual([{ table: 'vault_favorites', op: 'insert' }]);
  });
});
