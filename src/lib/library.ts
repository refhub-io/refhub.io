import type { SupabaseClient } from '@supabase/supabase-js';
import type { Publication, PublicationRelation, PublicationTag, Tag } from '@/types/database';
import type { RawVaultPublicationRow } from './publicationAggregate';

/** One user's library, as get_library() returns it (supabase/migrations/20261128120000_get_library.sql). */
export interface LibraryRows {
  publications: Publication[];
  vault_publications: RawVaultPublicationRow[];
  publication_tags: PublicationTag[];
  publication_relations: PublicationRelation[];
  pdf_assets: { publication_id: string | null; vault_publication_id: string | null; stored_pdf_url: string | null }[];
  tags: Tag[];
}

/**
 * The signed-in user's library in one round trip: their own papers and the papers in vaults they
 * own or that are shared with them, with those papers' tag links, relations, stored PDFs, and the
 * tags in scope. The server scopes it; other users' public vaults are never part of it.
 */
export async function fetchLibrary(supabase: SupabaseClient): Promise<LibraryRows> {
  const { data, error } = await supabase.rpc('get_library');
  if (error) throw error;
  return data as unknown as LibraryRows;
}
