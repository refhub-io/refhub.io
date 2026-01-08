import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Vault } from '@/types/database';
import { useToast } from './use-toast';

export function useVaultFork() {
  const { user } = useAuth();
  const { toast } = useToast();

  const forkVault = async (originalVault: Vault): Promise<Vault | null> => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to fork this vault.',
        variant: 'destructive',
      });
      return null;
    }

    try {
      // Create a new vault as a copy
      const { data: newVault, error: vaultError } = await supabase
        .from('vaults')
        .insert({
          user_id: user.id,
          name: `${originalVault.name} (Fork)`,
          description: originalVault.description,
          color: originalVault.color,
          category: originalVault.category,
          abstract: originalVault.abstract,
          is_public: false,
          is_shared: false,
        })
        .select()
        .single();

      if (vaultError) throw vaultError;

      // Record the fork relationship
      const { error: forkError } = await supabase
        .from('vault_forks')
        .insert({
          original_vault_id: originalVault.id,
          forked_vault_id: newVault.id,
          forked_by: user.id,
        });

      if (forkError) throw forkError;

      // Copy all publications from the original vault
      const { data: originalPubs } = await supabase
        .from('publications')
        .select('*')
        .eq('vault_id', originalVault.id);

      if (originalPubs && originalPubs.length > 0) {
        const pubsToInsert = originalPubs.map(pub => ({
          user_id: user.id,
          vault_id: newVault.id,
          title: pub.title,
          authors: pub.authors,
          year: pub.year,
          journal: pub.journal,
          volume: pub.volume,
          issue: pub.issue,
          pages: pub.pages,
          doi: pub.doi,
          url: pub.url,
          abstract: pub.abstract,
          pdf_url: pub.pdf_url,
          bibtex_key: pub.bibtex_key,
          publication_type: pub.publication_type,
          notes: pub.notes,
        }));

        await supabase.from('publications').insert(pubsToInsert);
      }

      toast({
        title: 'Vault forked successfully! 🍴',
        description: 'You can now edit and augment this collection.',
      });

      return newVault as Vault;
    } catch (error: any) {
      console.error('Error forking vault:', error);
      toast({
        title: 'Error forking vault',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const getForkedFrom = async (vaultId: string): Promise<Vault | null> => {
    try {
      const { data: forkData } = await supabase
        .from('vault_forks')
        .select('original_vault_id')
        .eq('forked_vault_id', vaultId)
        .maybeSingle();

      if (!forkData) return null;

      const { data: vaultData } = await supabase
        .from('vaults')
        .select('*')
        .eq('id', forkData.original_vault_id)
        .maybeSingle();

      return vaultData as Vault | null;
    } catch (error) {
      console.error('Error getting fork origin:', error);
      return null;
    }
  };

  const getForkCount = async (vaultId: string): Promise<number> => {
    try {
      const { count } = await supabase
        .from('vault_forks')
        .select('*', { count: 'exact', head: true })
        .eq('original_vault_id', vaultId);

      return count || 0;
    } catch (error) {
      console.error('Error getting fork count:', error);
      return 0;
    }
  };

  return {
    forkVault,
    getForkedFrom,
    getForkCount,
  };
}
