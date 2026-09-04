import type { SupabaseClient } from '@supabase/supabase-js';
import type { VaultSection } from '@/types/database';

export interface VaultSectionInput {
  name: string;
  description: string | null;
  position: number;
}

export interface VaultPublicationSectionPatch {
  section_id?: string | null;
  section_position?: number;
  featured?: boolean;
  featured_note?: string | null;
}

export async function fetchVaultSections(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  vaultId: string,
): Promise<VaultSection[]> {
  const { data, error } = await supabase
    .from('vault_sections')
    .select('*')
    .eq('vault_id', vaultId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as VaultSection[];
}

export async function createVaultSection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  vaultId: string,
  input: VaultSectionInput,
): Promise<VaultSection> {
  const { data, error } = await supabase
    .from('vault_sections')
    .insert({ vault_id: vaultId, name: input.name, description: input.description, position: input.position })
    .select()
    .single();
  if (error) throw error;
  return data as VaultSection;
}

export async function updateVaultSection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  sectionId: string,
  patch: Partial<VaultSectionInput>,
): Promise<VaultSection> {
  const { data, error } = await supabase
    .from('vault_sections')
    .update(patch)
    .eq('id', sectionId)
    .select()
    .single();
  if (error) throw error;
  return data as VaultSection;
}

export async function deleteVaultSection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  sectionId: string,
): Promise<void> {
  const { error } = await supabase.from('vault_sections').delete().eq('id', sectionId);
  if (error) throw error;
}

/** Persists a new section order — orderedIds is the full list of a vault's section ids, in the desired order. */
export async function reorderVaultSections(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  orderedIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('vault_sections').update({ position: i }).eq('id', orderedIds[i]);
    if (error) throw error;
  }
}

/** Patches a vault_publications row's section/featured fields. Owner-only — enforced server-side by the vault_publications_section_owner_only trigger. */
export async function updateVaultPublicationSection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  vaultPublicationId: string,
  patch: VaultPublicationSectionPatch,
): Promise<void> {
  const { error } = await supabase.from('vault_publications').update(patch).eq('id', vaultPublicationId);
  if (error) throw error;
}
