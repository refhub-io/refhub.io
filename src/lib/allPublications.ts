// Fetches the same cross-vault publication aggregate Dashboard.tsx builds
// for its main list, for use by smart collections (which match rules against
// every vault the user can access, not just one). See
// docs/superpowers/specs/2026-08-29-smart-collections-design.md
// ("Match/recompute strategy").
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Publication, Vault, Tag, PublicationTag } from '@/types/database';
import { buildAllPublications, buildPublicationVaultsMap, buildPublicationTagsMap, type RawVaultPublicationRow } from './publicationAggregate';
import { filterDashboardTags } from './dashboardTagScope';
import { fetchUserVaults } from './vaults';

export interface AllPublicationsData {
  publications: Publication[];
  vaults: Vault[];
  tags: Tag[];
  publicationVaultsMap: Record<string, string[]>;
  publicationTagsMap: Record<string, string[]>;
  // True when the publication_tags query itself failed (e.g. a slow/timed-out
  // query), so publicationTagsMap above is known-incomplete rather than a
  // genuine "nothing is tagged" result. Callers that match against tags
  // (smart collections) should treat this as "results may be incomplete"
  // rather than trusting an empty tag map at face value.
  tagsIncomplete: boolean;
}

/**
 * Throws the first error found among a batch of Supabase responses, so a
 * failed query (RLS denial, network blip, etc.) surfaces to the caller
 * instead of silently degrading into an empty/partial aggregate — which for
 * live smart-collection matching would be indistinguishable from "the user
 * genuinely has no data."
 */
function throwOnAnyError(results: { error: { message?: string } | null }[]): void {
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw failed.error;
  }
}

export async function fetchAllPublicationsData(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | null,
): Promise<AllPublicationsData> {
  const [vaultsData, pubsRes, vaultPubsRes, pubTagsRes] = await Promise.all([
    fetchUserVaults(supabase, userId, userEmail),
    supabase.from('publications').select('*').order('created_at', { ascending: false }),
    supabase.from('vault_publications').select('*').order('created_at', { ascending: false }),
    // Only these three columns feed buildPublicationTagsMap() below —
    // narrower than select('*') to cut payload size on what's shown to be
    // this hook's slowest query.
    supabase.from('publication_tags').select('id, publication_id, vault_publication_id, tag_id'),
  ]);
  // publication_tags is queried separately from the rest: it's the
  // slowest/most failure-prone query here (unscoped select across the whole
  // table, relying entirely on RLS), and it only feeds tag badges/matching —
  // it must not be able to wipe out vaults/publications too. A single
  // combined throwOnAnyError() used to do exactly that: any one query
  // failing discarded the whole Promise.all's results, including the
  // sidebar's own vault list, on every page built on this hook. (fetchUserVaults
  // throws its own errors, which reject this Promise.all same as before.)
  throwOnAnyError([pubsRes, vaultPubsRes]);
  if (pubTagsRes.error) {
    console.error('Failed to fetch publication_tags (tag data will be incomplete):', pubTagsRes.error);
  }

  const { ownedVaults, sharedVaults, sharedVaultIds, scopedVaultIds } = vaultsData;

  const tagQueries = [
    supabase.from('tags').select('*').eq('user_id', userId).is('vault_id', null).order('name'),
  ];
  if (scopedVaultIds.length > 0) {
    tagQueries.push(supabase.from('tags').select('*').in('vault_id', scopedVaultIds).order('name'));
  }
  const tagResults = await Promise.all(tagQueries);
  throwOnAnyError(tagResults);
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
    tagsIncomplete: Boolean(pubTagsRes.error),
  };
}
