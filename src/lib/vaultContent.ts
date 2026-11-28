import type { SupabaseClient } from '@supabase/supabase-js';
import type { Publication, PublicationRelation, PublicationTag, Tag, Vault, VaultShare } from '@/types/database';
import type { LibraryRows } from './library';
import type { RawVaultPublicationRow } from './publicationAggregate';

type StoredPdfRow = LibraryRows['pdf_assets'][number];

/** One vault's content, as get_vault_content() returns it (supabase/migrations/20261128140000_get_vault_content.sql). */
export interface VaultContentRows {
  /** null when the caller can't read the vault; its papers, shares and links are then empty too. */
  vault: Vault | null;
  vault_publications: (RawVaultPublicationRow & { updated_by: string | null })[];
  /** The vault's tags, then the caller's personal ones. */
  tags: Tag[];
  vault_shares: VaultShare[];
  publication_tags: PublicationTag[];
  publication_relations: PublicationRelation[];
  pdf_assets: StoredPdfRow[];
}

/**
 * Everything the vault page shows, in one round trip: the vault row, its papers, the tags they can
 * carry, its shares, and the papers' tag links, relations and stored PDFs. Row-level security
 * applies, so a vault the caller can't read comes back with `vault: null`.
 */
export async function fetchVaultContentRows(supabase: SupabaseClient, vaultId: string): Promise<VaultContentRows> {
  const { data, error } = await supabase.rpc('get_vault_content', { p_vault_id: vaultId });
  if (error) throw error;
  return data as unknown as VaultContentRows;
}

/** Each vault paper's stored PDF: its own copy's, or else its canonical paper's. */
export function buildPdfAssetsMap(publications: Publication[], assets: StoredPdfRow[]): Record<string, string | null> {
  const canonical = new Map<string, string | null>();
  for (const asset of assets) {
    if (!asset.vault_publication_id && asset.publication_id) {
      canonical.set(asset.publication_id, asset.stored_pdf_url ?? null);
    }
  }
  const map: Record<string, string | null> = {};
  for (const publication of publications) {
    map[publication.id] = publication.original_publication_id
      ? canonical.get(publication.original_publication_id) ?? null
      : null;
  }
  for (const asset of assets) {
    if (asset.vault_publication_id) map[asset.vault_publication_id] = asset.stored_pdf_url ?? null;
  }
  return map;
}
