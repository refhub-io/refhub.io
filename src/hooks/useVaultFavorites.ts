import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { VaultFavorite, Vault } from '@/types/database';
import { logger } from '@/lib/logger';

interface FavoriteVault extends Vault {
  publication_count?: number;
  owner?: {
    display_name: string | null;
    email: string | null;
  };
}

export function vaultFavoritesQueryKey(userId: string | undefined) {
  return ['vault-favorites', userId] as const;
}

async function fetchFavoritesData(userId: string): Promise<{ favorites: VaultFavorite[]; favoriteVaults: FavoriteVault[] }> {
  const { data: favsData, error: favsError } = await supabase
    .from('vault_favorites')
    .select('*')
    .eq('user_id', userId);
  if (favsError) throw favsError;

  const favorites = (favsData as VaultFavorite[]) || [];
  if (favorites.length === 0) return { favorites, favoriteVaults: [] };

  const vaultIds = favorites.map((f) => f.vault_id);
  const { data: vaultsData, error: vaultsError } = await supabase
    .from('vaults')
    .select('*')
    .in('id', vaultIds);
  if (vaultsError) throw vaultsError;

  const vaults = (vaultsData as Vault[]) || [];
  const ownerIds = [...new Set(vaults.map((v) => v.user_id))];

  // Batched: one query per data source across all favorited vaults, instead
  // of the previous 2-queries-PER-vault fan-out (same N+1 pattern fixed on
  // TheCodex's public vault listing — see #206).
  const [pubRows, profileRows] = await Promise.all([
    supabase.from('vault_publications').select('vault_id').in('vault_id', vaultIds).then((res) => res.data || []),
    supabase.from('profiles').select('user_id, display_name, email').in('user_id', ownerIds).then((res) => res.data || []),
  ]);

  const publicationCounts = new Map<string, number>();
  (pubRows as { vault_id: string }[]).forEach((row) => {
    publicationCounts.set(row.vault_id, (publicationCounts.get(row.vault_id) || 0) + 1);
  });
  const profilesByUserId = new Map(
    (profileRows as { user_id: string; display_name: string | null; email: string | null }[]).map((p) => [p.user_id, p]),
  );

  const favoriteVaults: FavoriteVault[] = vaults.map((vault) => ({
    ...vault,
    publication_count: publicationCounts.get(vault.id) || 0,
    owner: profilesByUserId.get(vault.user_id),
  }));

  return { favorites, favoriteVaults };
}

// react-query-backed for the same reason useVaults()/useProfile() are
// (#206): Sidebar.tsx calls this directly, and since a fresh Sidebar
// instance mounts on every page navigation, a plain useState/useEffect
// hook here refetched from empty state every single time.
export function useVaultFavorites() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: vaultFavoritesQueryKey(user?.id),
    queryFn: () => fetchFavoritesData(user!.id),
    enabled: !!user,
  });

  const favorites = query.data?.favorites ?? [];
  const favoriteVaults = query.data?.favoriteVaults ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: vaultFavoritesQueryKey(user?.id) });

  const isFavorite = (vaultId: string) => favorites.some((f) => f.vault_id === vaultId);

  const addFavorite = async (vaultId: string) => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('vault_favorites')
        .insert({ vault_id: vaultId, user_id: user.id });
      if (error) throw error;
      await invalidate();
      return true;
    } catch (error) {
      logger.error('useVaultFavorites', 'Error adding favorite:', error);
      return false;
    }
  };

  const removeFavorite = async (vaultId: string) => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('vault_favorites')
        .delete()
        .eq('vault_id', vaultId)
        .eq('user_id', user.id);
      if (error) throw error;
      await invalidate();
      return true;
    } catch (error) {
      logger.error('useVaultFavorites', 'Error removing favorite:', error);
      return false;
    }
  };

  const toggleFavorite = async (vaultId: string) => (
    isFavorite(vaultId) ? removeFavorite(vaultId) : addFavorite(vaultId)
  );

  return {
    favorites,
    favoriteVaults,
    loading: query.isLoading,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    refetch: query.refetch,
  };
}
