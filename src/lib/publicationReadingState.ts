import type { SupabaseClient } from '@supabase/supabase-js';
import type { Publication } from '@/types/database';

type ReadingStatePatch = Partial<Pick<Publication, 'reading_state' | 'important'>>;

/**
 * Updates reading_state/important on whichever table the given id actually
 * lives in — mirrors the "check vault_publications first, else publications"
 * branch Dashboard.tsx's handleSavePublication already uses. Never touches
 * BIBLIOGRAPHIC_FIELDS, so no canonical/sibling fan-out applies here.
 */
export async function updatePublicationReadingState(
  supabase: SupabaseClient,
  publicationId: string,
  patch: ReadingStatePatch,
): Promise<{ error: Error | null }> {
  const { data: vaultPub } = await supabase
    .from('vault_publications')
    .select('id')
    .eq('id', publicationId)
    .maybeSingle();

  const table = vaultPub ? 'vault_publications' : 'publications';
  const { error } = await supabase.from(table).update(patch).eq('id', publicationId);

  return { error: error ? new Error(error.message) : null };
}
