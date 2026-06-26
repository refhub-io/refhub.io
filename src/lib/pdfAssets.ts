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
