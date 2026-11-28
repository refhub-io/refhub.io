import type { Publication, Vault } from '@/types/database';
import type { VaultRole } from '@/types/vault-extensions';

export interface SharedPublicationInfo {
  /** The vaults holding the paper, all shared with the user, by name. */
  vaultNames: string[];
  /** Whether the user is an editor in at least one of those vaults. */
  canEdit: boolean;
}

/**
 * The papers in a user's library only because someone shared a vault with them: ones they didn't
 * add themselves, in no vault they own. Keyed by publication id.
 */
export function findSharedPublications(
  publications: Publication[],
  publicationVaultsMap: Record<string, string[]>,
  { userId, vaults, sharedVaultRoles = {} }: {
    userId: string | undefined;
    /** Every vault the user can see: their own and the ones shared with them. */
    vaults: Vault[];
    sharedVaultRoles?: Record<string, VaultRole>;
  },
): Record<string, SharedPublicationInfo> {
  if (!userId) return {};
  const vaultsById = new Map(vaults.map((vault) => [vault.id, vault]));
  const shared: Record<string, SharedPublicationInfo> = {};
  for (const publication of publications) {
    if (publication.user_id === userId) continue;
    const vaultIds = publicationVaultsMap[publication.id] ?? [];
    if (vaultIds.length === 0) continue;
    if (vaultIds.some((id) => vaultsById.get(id)?.user_id === userId)) continue;
    shared[publication.id] = {
      vaultNames: vaultIds
        .map((id) => vaultsById.get(id)?.name)
        .filter((name): name is string => Boolean(name)),
      canEdit: vaultIds.some((id) => sharedVaultRoles[id] === 'editor' || sharedVaultRoles[id] === 'owner'),
    };
  }
  return shared;
}
