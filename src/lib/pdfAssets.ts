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
 * Sets or clears a Drive PDF asset and fans it out like a bibliographic
 * field: to the canonical publication row, and to every sibling vault copy
 * that already has its own override row, via one bulk UPDATE -- the same
 * shape as updateVaultPublication's bibliographic fan-out
 * (`.update(patch).eq('original_publication_id', X).neq('id', originId)`),
 * not a per-sibling upsert loop.
 *
 * A sibling vault_publications row with no asset row of its own doesn't
 * need one created: the read side (VaultContentContext's fetchPdfAssets)
 * already falls back to the canonical row's value when no vault-specific
 * override exists, so it inherits the new value automatically. This also
 * sidesteps attributing publication_pdf_assets.user_id (RLS-enforced per
 * row) to vaults the acting user doesn't own -- the bulk UPDATE only
 * touches stored_pdf_url/status/error_message on rows that already exist,
 * leaving each row's original user_id untouched.
 *
 * Earlier versions tried a per-sibling upsert with an ownership lookup
 * (first via an embedded-resource join filter, then via a separate owned-
 * vaults query) to decide which siblings' rows to write and how to
 * attribute them -- both silently produced zero rows in practice. This
 * version doesn't need that lookup at all.
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

  const status = storedPdfUrl ? 'stored' : 'removed';

  if (originVaultPublicationId) {
    const { error } = await client
      .from('publication_pdf_assets')
      .upsert(
        {
          user_id: userId,
          publication_id: publicationId,
          vault_publication_id: originVaultPublicationId,
          storage_provider: 'google_drive',
          stored_pdf_url: storedPdfUrl,
          stored_file_id: null,
          status,
          error_message: null,
        },
        { onConflict: 'vault_publication_id,storage_provider' },
      );
    if (error) throw error;
  }

  if (!publicationId) return;

  await replacePublicationPdfAsset(client, {
    user_id: userId,
    publication_id: publicationId,
    vault_publication_id: null,
    storage_provider: 'google_drive',
    stored_pdf_url: storedPdfUrl,
    stored_file_id: null,
    status,
    error_message: null,
  });

  let siblingIdsQuery = client
    .from('vault_publications')
    .select('id')
    .eq('original_publication_id', publicationId);

  if (originVaultPublicationId) {
    siblingIdsQuery = siblingIdsQuery.neq('id', originVaultPublicationId);
  }

  const { data: siblings, error: siblingsError } = await siblingIdsQuery;
  if (siblingsError) throw siblingsError;
  if (!siblings || siblings.length === 0) return;

  const siblingIds = (siblings as { id: string }[]).map((sibling) => sibling.id);

  const { error: fanOutError } = await client
    .from('publication_pdf_assets')
    .update({ stored_pdf_url: storedPdfUrl, status, error_message: null })
    .eq('storage_provider', 'google_drive')
    .in('vault_publication_id', siblingIds);
  if (fanOutError) throw fanOutError;
}
