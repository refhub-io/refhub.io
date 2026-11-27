import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicationRelation } from '@/types/database';
import { fetchAllRowsForIds } from '@/lib/fetchAllRows';

/**
 * Every relation that touches any of the given publication ids, as source or target, filtered on
 * the server and paged past PostgREST's 1,000-row cap. A relation between ids in different chunks
 * comes back once per chunk, so results are de-duplicated by id. Returns an error, never a
 * partial list.
 */
export async function fetchRelationsForPublicationIds(
  client: SupabaseClient,
  publicationIds: string[],
): Promise<{ data: PublicationRelation[]; error: unknown }> {
  const { data, error } = await fetchAllRowsForIds<PublicationRelation>(publicationIds, (chunk, from, to) => {
    const list = chunk.join(',');
    return client
      .from('publication_relations')
      .select('*')
      .or(`publication_id.in.(${list}),related_publication_id.in.(${list})`)
      .order('id')
      .range(from, to);
  });
  if (error) return { data: [], error };
  return { data: [...new Map(data.map((relation) => [relation.id, relation])).values()], error: null };
}
