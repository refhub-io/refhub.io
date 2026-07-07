import { supabase } from '@/integrations/supabase/client';

export type PdfAssetRecord = {
  user_id: string;
  publication_id: string | null;
  vault_publication_id: string | null;
  storage_provider: 'google_drive';
  stored_pdf_url: string | null;
  stored_file_id: string | null;
  status: string;
  error_message: string | null;
};

export type PdfAssetClient = Pick<typeof supabase, 'from'>;

async function deleteExistingPublicationAsset(
  client: PdfAssetClient,
  publicationId: string,
): Promise<void> {
  const { error } = await client
    .from('publication_pdf_assets')
    .delete()
    .eq('publication_id', publicationId)
    .is('vault_publication_id', null)
    .eq('storage_provider', 'google_drive');

  if (error) throw error;
}

/**
 * PostgREST cannot use RefHub's partial unique publication asset index with
 * `on_conflict=publication_id,storage_provider`; it requires a full unique or
 * exclusion constraint. Keep the partial-index data model and avoid the invalid
 * upsert target by replacing the canonical publication-level Drive asset row.
 */
export async function replacePublicationPdfAsset(
  client: PdfAssetClient,
  record: PdfAssetRecord,
): Promise<void> {
  if (!record.publication_id) {
    throw new Error('publication_id is required for canonical PDF assets');
  }

  await deleteExistingPublicationAsset(client, record.publication_id);

  if (record.stored_pdf_url && record.status === 'stored') {
    const { error } = await client
      .from('publication_pdf_assets')
      .insert({ ...record, vault_publication_id: null });

    if (error) throw error;
  }
}

/**
 * Sets or clears a Drive PDF asset and fans it out like a bibliographic field:
 * to the canonical publication row and every sibling vault_publications copy
 * of the same paper, in every vault -- unrestricted by ownership, matching
 * how updateVaultPublication's bibliographic fan-out already propagates to
 * every vault_publications row sharing original_publication_id with no
 * ownership filter. An earlier version scoped this to vaults the acting
 * user owns, to avoid attributing publication_pdf_assets.user_id (RLS
 * per-row) to the wrong owner -- but that filter turned out to exclude the
 * user's own vaults too, since it required deriving vault_id ownership via
 * a query this app's RLS/setup didn't reliably support, silently dropping
 * the fan-out. Attribute each sibling row's user_id to its own vault's
 * actual owner (falling back to the acting user only if that lookup comes
 * back empty) instead of restricting which vaults get the write.
 */
export async function syncDrivePdfAsset(
  client: PdfAssetClient,
  params: {
    userId: string;
    publicationId: string | null;
    storedPdfUrl: string | null;
    /** The vault_publication_id the edit originated from, if any. */
    originVaultPublicationId?: string | null;
  },
): Promise<void> {
  const { userId, publicationId, storedPdfUrl, originVaultPublicationId = null } = params;

  const baseRecord = {
    storage_provider: 'google_drive' as const,
    stored_pdf_url: storedPdfUrl,
    stored_file_id: null as string | null,
    status: storedPdfUrl ? 'stored' : 'removed',
    error_message: null as string | null,
  };

  if (originVaultPublicationId) {
    const { error } = await client
      .from('publication_pdf_assets')
      .upsert(
        { ...baseRecord, user_id: userId, publication_id: publicationId, vault_publication_id: originVaultPublicationId },
        { onConflict: 'vault_publication_id,storage_provider' },
      );
    if (error) throw error;
  }

  if (!publicationId) return;

  await replacePublicationPdfAsset(client, { ...baseRecord, user_id: userId, publication_id: publicationId, vault_publication_id: null });

  let siblingsQuery = client
    .from('vault_publications')
    .select('id, vault_id')
    .eq('original_publication_id', publicationId);

  if (originVaultPublicationId) {
    siblingsQuery = siblingsQuery.neq('id', originVaultPublicationId);
  }

  const { data: siblings, error: siblingsError } = await siblingsQuery;
  if (siblingsError) throw siblingsError;
  if (!siblings || siblings.length === 0) return;

  const siblingRows = siblings as { id: string; vault_id: string }[];
  const vaultIds = [...new Set(siblingRows.map((sibling) => sibling.vault_id))];

  const { data: vaultOwners, error: vaultOwnersError } = await client
    .from('vaults')
    .select('id, user_id')
    .in('id', vaultIds);
  if (vaultOwnersError) throw vaultOwnersError;

  const ownerByVaultId = new Map(
    (vaultOwners as { id: string; user_id: string }[] | null ?? []).map((vault) => [vault.id, vault.user_id]),
  );

  const { error: fanOutError } = await client.from('publication_pdf_assets').upsert(
    siblingRows.map((sibling) => ({
      ...baseRecord,
      user_id: ownerByVaultId.get(sibling.vault_id) ?? userId,
      publication_id: publicationId,
      vault_publication_id: sibling.id,
    })),
    { onConflict: 'vault_publication_id,storage_provider' },
  );
  if (fanOutError) throw fanOutError;
}
