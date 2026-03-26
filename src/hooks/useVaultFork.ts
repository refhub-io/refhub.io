import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import { forkVault as forkVaultLib, getVaultForkInfo, getVaultForkCount } from '@/lib/vaultFork';
import { Vault } from '@/types/database';

export function useVaultFork() {
  const { user } = useAuth();
  const { toast } = useToast();

  /**
   * Fork a vault. Returns the new vault id on success, null on failure.
   */
  const forkVault = async (originalVault: Vault): Promise<string | null> => {
    if (!user) {
      toast({
        title: 'sign_in_required',
        description: 'Please sign in to fork this vault.',
        variant: 'destructive',
      });
      return null;
    }

    try {
      const newVaultId = await forkVaultLib(originalVault.id, user);
      toast({ title: 'vault forked — find it in your vaults' });
      return newVaultId;
    } catch (error) {
      toast({
        title: 'fork_failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
      return null;
    }
  };

  return {
    forkVault,
    getForkedFrom: (vaultId: string) =>
      getVaultForkInfo(vaultId).then(info => info.forkedFrom),
    getForkCount: getVaultForkCount,
  };
}
