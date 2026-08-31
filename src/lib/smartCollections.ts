import type { SupabaseClient } from '@supabase/supabase-js';
import type { SmartCollection } from '@/types/database';
import type { PublicationFilter } from '@/components/publications/FilterBuilder';

export interface SmartCollectionInput {
  name: string;
  description?: string | null;
  color: string | null;
  filters: PublicationFilter[];
}

export async function fetchSmartCollections(supabase: SupabaseClient, userId: string): Promise<SmartCollection[]> {
  const { data, error } = await supabase
    .from('smart_collections')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as SmartCollection[]) || [];
}

export async function createSmartCollection(
  supabase: SupabaseClient,
  userId: string,
  input: SmartCollectionInput,
): Promise<SmartCollection> {
  const { data, error } = await supabase
    .from('smart_collections')
    .insert([{ ...input, user_id: userId }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as SmartCollection;
}

export async function updateSmartCollection(
  supabase: SupabaseClient,
  id: string,
  input: SmartCollectionInput,
): Promise<SmartCollection> {
  const { data, error } = await supabase
    .from('smart_collections')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as SmartCollection;
}

export async function deleteSmartCollection(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('smart_collections').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
