import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { VaultFavorite, Vault } from '@/types/database';

interface FavoriteVault extends Vault {
  publication_count?: number;
  owner?: {
    display_name: string | null;
    email: string | null;
  };
}

export function useVaultFavorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<VaultFavorite[]>([]);
  const [favoriteVaults, setFavoriteVaults] = useState<FavoriteVault[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = useCallback(async () => {
    if (!user) {
      setFavorites([]);
      setFavoriteVaults([]);
      setLoading(false);
      return;
    }

    try {
      const { data: favsData } = await supabase
        .from('vault_favorites')
        .select('*')
        .eq('user_id', user.id);

      if (favsData) {
        setFavorites(favsData as VaultFavorite[]);

        // Fetch the actual vault data for favorites
        if (favsData.length > 0) {
          const vaultIds = favsData.map(f => f.vault_id);
          const { data: vaultsData } = await supabase
            .from('vaults')
            .select('*')
            .in('id', vaultIds)
            .eq('is_public', true);

          if (vaultsData) {
            // Enrich with publication counts and owner info
            const enrichedVaults = await Promise.all(
              vaultsData.map(async (vault) => {
                const { count } = await supabase
                  .from('publications')
                  .select('*', { count: 'exact', head: true })
                  .eq('vault_id', vault.id);

                const { data: profileData } = await supabase
                  .from('profiles')
                  .select('display_name, email')
                  .eq('user_id', vault.user_id)
                  .maybeSingle();

                return {
                  ...vault,
                  publication_count: count || 0,
                  owner: profileData || undefined,
                } as FavoriteVault;
              })
            );
            setFavoriteVaults(enrichedVaults);
          }
        } else {
          setFavoriteVaults([]);
        }
      }
    } catch (error) {
      console.error('Error fetching vault favorites:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const isFavorite = (vaultId: string) => {
    return favorites.some(f => f.vault_id === vaultId);
  };

  const addFavorite = async (vaultId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('vault_favorites')
        .insert({ vault_id: vaultId, user_id: user.id });

      if (error) throw error;
      await fetchFavorites();
      return true;
    } catch (error) {
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
      await fetchFavorites();
      return true;
    } catch (error) {
      return false;
    }
  };

  const toggleFavorite = async (vaultId: string) => {
    if (isFavorite(vaultId)) {
      return removeFavorite(vaultId);
    } else {
      return addFavorite(vaultId);
    }
  };

  return {
    favorites,
    favoriteVaults,
    loading,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    refetch: fetchFavorites,
  };
}
