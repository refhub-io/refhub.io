// Fetches the same cross-vault publication aggregate Dashboard.tsx builds
// for its main list, for use by smart collections (which match rules against
// every vault the user can access, not just one). See
// docs/superpowers/specs/2026-08-29-smart-collections-design.md
// ("Match/recompute strategy").
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Publication, Vault, Tag } from '@/types/database';
import { buildAllPublications, buildPublicationVaultsMap, buildPublicationTagsMap } from './publicationAggregate';
import { filterDashboardTags } from './dashboardTagScope';
import { fetchUserVaults } from './vaults';
import { findSharedPublications, type SharedPublicationInfo } from './sharedPublications';
import { fetchLibrary } from './library';

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
  /** Papers here because a vault was shared with the user, by id (see findSharedPublications). */
  sharedPublications: Record<string, SharedPublicationInfo>;
}

export async function fetchAllPublicationsData(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | null,
): Promise<AllPublicationsData> {
  // One round trip for the library, scoped on the server (#275). The unscoped selects this
  // replaced returned every public paper in the system and stopped at 1,000 rows.
  const [vaultsData, library] = await Promise.all([
    fetchUserVaults(supabase, userId, userEmail),
    fetchLibrary(supabase),
  ]);

  const { ownedVaults, sharedVaults, sharedVaultIds, sharedVaultRoles } = vaultsData;
  const scopedTags = filterDashboardTags(
    library.tags,
    { userId, ownedVaults, sharedVaultIds },
  );
  const tags = Array.from(new Map(scopedTags.map((tag) => [tag.id, tag])).values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const originalPublications = library.publications;
  const { allPublications, vaultPublicationLinks } = buildAllPublications(
    originalPublications,
    library.vault_publications,
  );

  const publicationVaultsMap = buildPublicationVaultsMap(allPublications, vaultPublicationLinks);
  const publicationTagsMap = buildPublicationTagsMap(
    allPublications,
    library.publication_tags,
    vaultPublicationLinks,
  );

  const vaults = [...ownedVaults, ...sharedVaults];
  return {
    publications: allPublications,
    vaults,
    tags,
    publicationVaultsMap,
    publicationTagsMap,
    // The library arrives whole or not at all, so tags are never partial anymore.
    tagsIncomplete: false,
    sharedPublications: findSharedPublications(allPublications, publicationVaultsMap, { userId, vaults, sharedVaultRoles }),
  };
}
