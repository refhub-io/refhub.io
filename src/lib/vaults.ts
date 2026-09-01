// The single canonical "fetch this user's owned + shared vaults"
// implementation. Before this, Dashboard.tsx, TheCodex.tsx, Users.tsx,
// VaultDetail.tsx, and allPublications.ts (used by SmartCollections,
// SmartCollectionDetail, CodexTopic) each had their own independent copy of
// this exact query pair, refetched from scratch — with no shared cache — on
// every single page mount. See useVaults() (src/hooks/useVaults.ts) for the
// react-query-cached hook built on top of this.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Vault } from '@/types/database';
import type { VaultRole } from '@/types/vault-extensions';
import { getDashboardAccessibleVaultIds } from './dashboardTagScope';

export interface UserVaultsData {
  ownedVaults: Vault[];
  sharedVaults: Vault[];
  sharedVaultIds: string[];
  // This user's role (editor/viewer) on each shared vault, keyed by vault
  // id — needed for permission checks like drag-and-drop drop targets.
  sharedVaultRoles: Record<string, VaultRole>;
  // Owned + shared vault ids combined — the set of vaults whose tags are
  // in scope for this user, per getDashboardAccessibleVaultIds.
  scopedVaultIds: string[];
}

function throwOnAnyError(results: { error: { message?: string } | null }[]): void {
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw failed.error;
  }
}

export async function fetchUserVaults(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | null,
): Promise<UserVaultsData> {
  const [ownedVaultsRes, sharedVaultsRes] = await Promise.all([
    supabase.from('vaults').select('*').eq('user_id', userId).order('name'),
    supabase
      .from('vault_shares')
      .select('vault_id, role')
      .or(`shared_with_email.eq.${userEmail ?? ''},shared_with_user_id.eq.${userId}`),
  ]);
  throwOnAnyError([ownedVaultsRes, sharedVaultsRes]);

  const ownedVaults = (ownedVaultsRes.data as Vault[]) || [];
  const shares = (sharedVaultsRes.data as { vault_id: string; role?: VaultRole }[]) || [];
  const sharedVaultIds = shares.map((share) => share.vault_id);
  const scopedVaultIds = getDashboardAccessibleVaultIds({ ownedVaults, sharedVaultIds });

  const sharedVaultRoles: Record<string, VaultRole> = {};
  for (const share of shares) {
    if (share.role) sharedVaultRoles[share.vault_id] = share.role;
  }

  let sharedVaults: Vault[] = [];
  if (sharedVaultIds.length > 0) {
    const sharedVaultsDetailRes = await supabase.from('vaults').select('*').in('id', sharedVaultIds);
    throwOnAnyError([sharedVaultsDetailRes]);
    sharedVaults = (sharedVaultsDetailRes.data as Vault[]) || [];
  }

  return { ownedVaults, sharedVaults, sharedVaultIds, sharedVaultRoles, scopedVaultIds };
}
