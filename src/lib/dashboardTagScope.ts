import { Tag, Vault } from '@/types/database';

interface DashboardTagScopeInput {
  userId: string;
  ownedVaults: Pick<Vault, 'id'>[];
  sharedVaultIds: string[];
}

export function getDashboardAccessibleVaultIds({
  ownedVaults,
  sharedVaultIds,
}: Omit<DashboardTagScopeInput, 'userId'>): string[] {
  return [...new Set([
    ...ownedVaults.map((vault) => vault.id),
    ...sharedVaultIds,
  ])];
}

export function filterDashboardTags(
  tags: Tag[],
  { userId, ownedVaults, sharedVaultIds }: DashboardTagScopeInput,
): Tag[] {
  const allowedVaultIds = new Set(getDashboardAccessibleVaultIds({ ownedVaults, sharedVaultIds }));

  return tags.filter((tag) => {
    if (!tag.vault_id) {
      return tag.user_id === userId;
    }

    return allowedVaultIds.has(tag.vault_id);
  });
}
