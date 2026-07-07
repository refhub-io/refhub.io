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
 * of the same paper, in every vault the *acting user* owns. Scoped to
 * owned vaults only (not vaults merely shared with the user) because
 * publication_pdf_assets.user_id records who uploaded the file and is
 * RLS-enforced per row — attributing a fan-out write to another owner's
 * vault copy under the acting user's id would misattribute or hide it
 * from that owner's own RLS-scoped reads.
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
    user_id: userId,
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
        { ...baseRecord, publication_id: publicationId, vault_publication_id: originVaultPublicationId },
        { onConflict: 'vault_publication_id,storage_provider' },
      );
    if (error) throw error;
  }

  if (!publicationId) return;

  await replacePublicationPdfAsset(client, { ...baseRecord, publication_id: publicationId, vault_publication_id: null });

  // Two plain queries instead of an embedded-resource join filter
  // (`vaults!inner(user_id)` + `.eq('vaults.user_id', ...)`), which this
  // codebase has no other precedent for and turned out to silently return
  // no rows here rather than throw -- the fan-out looked like a no-op with
  // no visible error.
  const { data: ownedVaults, error: ownedVaultsError } = await client
    .from('vaults')
    .select('id')
    .eq('user_id', userId);
  if (ownedVaultsError) throw ownedVaultsError;
  if (!ownedVaults || ownedVaults.length === 0) return;

  const ownedVaultIds = (ownedVaults as { id: string }[]).map((vault) => vault.id);

  let siblingsQuery = client
    .from('vault_publications')
    .select('id')
    .eq('original_publication_id', publicationId)
    .in('vault_id', ownedVaultIds);

  if (originVaultPublicationId) {
    siblingsQuery = siblingsQuery.neq('id', originVaultPublicationId);
  }

  const { data: siblings, error: siblingsError } = await siblingsQuery;
  if (siblingsError) throw siblingsError;
  if (!siblings || siblings.length === 0) return;

  const { error: fanOutError } = await client.from('publication_pdf_assets').upsert(
    (siblings as { id: string }[]).map((sibling) => ({
      ...baseRecord,
      publication_id: publicationId,
      vault_publication_id: sibling.id,
    })),
    { onConflict: 'vault_publication_id,storage_provider' },
  );
  if (fanOutError) throw fanOutError;
}
