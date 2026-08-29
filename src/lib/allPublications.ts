// Fetches the same cross-vault publication aggregate Dashboard.tsx builds
// for its main list, for use by smart collections (which match rules against
// every vault the user can access, not just one). See
// docs/superpowers/specs/2026-08-29-smart-collections-design.md
// ("Match/recompute strategy").
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Publication, Vault, Tag, PublicationTag } from '@/types/database';
import { buildAllPublications, buildPublicationVaultsMap, buildPublicationTagsMap, type RawVaultPublicationRow } from './publicationAggregate';
import { getDashboardAccessibleVaultIds, filterDashboardTags } from './dashboardTagScope';

export interface AllPublicationsData {
  publications: Publication[];
  vaults: Vault[];
  tags: Tag[];
  publicationVaultsMap: Record<string, string[]>;
  publicationTagsMap: Record<string, string[]>;
}

export async function fetchAllPublicationsData(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | null,
): Promise<AllPublicationsData> {
  const [pubsRes, ownedVaultsRes, sharedVaultsRes, vaultPubsRes, pubTagsRes] = await Promise.all([
    supabase.from('publications').select('*').order('created_at', { ascending: false }),
    supabase.from('vaults').select('*').eq('user_id', userId).order('name'),
    supabase
      .from('vault_shares')
      .select('vault_id, role')
      .or(`shared_with_email.eq.${userEmail ?? ''},shared_with_user_id.eq.${userId}`),
    supabase.from('vault_publications').select('*').order('created_at', { ascending: false }),
    supabase.from('publication_tags').select('*'),
  ]);

  const ownedVaults = (ownedVaultsRes.data as Vault[]) || [];
  const sharedVaultIds = (sharedVaultsRes.data || []).map((share: { vault_id: string }) => share.vault_id);
  const scopedVaultIds = getDashboardAccessibleVaultIds({ ownedVaults, sharedVaultIds });

  let sharedVaults: Vault[] = [];
  if (sharedVaultIds.length > 0) {
    const { data: sharedVaultDetails } = await supabase.from('vaults').select('*').in('id', sharedVaultIds);
    sharedVaults = (sharedVaultDetails as Vault[]) || [];
  }

  const tagQueries = [
    supabase.from('tags').select('*').eq('user_id', userId).is('vault_id', null).order('name'),
  ];
  if (scopedVaultIds.length > 0) {
    tagQueries.push(supabase.from('tags').select('*').in('vault_id', scopedVaultIds).order('name'));
  }
  const tagResults = await Promise.all(tagQueries);
  const scopedTags = filterDashboardTags(
    tagResults.flatMap((result) => (result.data as Tag[] | null) || []),
    { userId, ownedVaults, sharedVaultIds },
  );
  const tags = Array.from(new Map(scopedTags.map((tag) => [tag.id, tag])).values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const originalPublications = (pubsRes.data as Publication[]) || [];
  const { allPublications, vaultPublicationLinks } = buildAllPublications(
    originalPublications,
    (vaultPubsRes.data as RawVaultPublicationRow[]) || [],
  );

  const publicationVaultsMap = buildPublicationVaultsMap(allPublications, vaultPublicationLinks);
  const publicationTagsMap = buildPublicationTagsMap(
    allPublications,
    (pubTagsRes.data as PublicationTag[]) || [],
    vaultPublicationLinks,
  );

  return {
    publications: allPublications,
    vaults: [...ownedVaults, ...sharedVaults],
    tags,
    publicationVaultsMap,
    publicationTagsMap,
  };
}
