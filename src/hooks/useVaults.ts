import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { fetchUserVaults } from '@/lib/vaults';
import type { Vault } from '@/types/database';

export function vaultsQueryKey(userId: string | undefined) {
  return ['vaults', userId] as const;
}

/**
 * The single shared source of "this user's owned + shared vaults" for
 * sidebar nav, cached across page navigations via react-query (already
 * configured app-wide in src/lib/queryClient.ts — placeholderData keeps the
 * previous list visible during a background refetch instead of resetting to
 * empty, which is what caused the sidebar to visibly empty-then-repopulate
 * on every single page navigation before this hook existed).
 *
 * Every page that mutates a vault (create/rename/delete/share) must call
 * useInvalidateVaults() afterward so every other mounted page's sidebar
 * picks up the change — react-query won't know about a write it didn't make.
 */
export function useVaults() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: vaultsQueryKey(user?.id),
    queryFn: () => fetchUserVaults(supabase, user!.id, user!.email ?? null),
    enabled: !!user,
  });

  const ownedVaults: Vault[] = query.data?.ownedVaults ?? [];
  const sharedVaults: Vault[] = query.data?.sharedVaults ?? [];

  return {
    vaults: [...ownedVaults, ...sharedVaults],
    ownedVaults,
    sharedVaults,
    // isLoading is true only for the very first fetch with no cached data —
    // a background revalidation on an already-cached navigation reports
    // isFetching, not isLoading, so the sidebar doesn't flash a spinner for
    // every silent refresh.
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Call after any vault create/rename/delete/share mutation. */
export function useInvalidateVaults() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: vaultsQueryKey(user?.id) });
}

/** Non-hook form, for use inside async handlers that already have a userId and queryClient in scope. */
export function invalidateVaults(queryClient: QueryClient, userId: string | undefined) {
  return queryClient.invalidateQueries({ queryKey: vaultsQueryKey(userId) });
}
