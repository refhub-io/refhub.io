import type { SupabaseClient } from '@supabase/supabase-js';
import type { Vault, VaultStats } from '@/types/database';

/** A public vault's card in the Codex grid, with exact counts from the database. */
export interface CodexVault extends Vault {
  publication_count: number;
  stats: VaultStats | null;
  favorites_count: number;
  fork_count: number;
  is_fork: boolean;
  owner: { display_name: string | null; avatar_url: string | null; username: string | null } | null;
}

/** Where the next page starts: the last card's updated_at and id. */
export interface CodexVaultsCursor {
  updated_at: string;
  id: string;
}

export interface CodexVaultsPage {
  vaults: CodexVault[];
  /** Every vault matching the search and category, not just this page's. */
  total: number;
  next: CodexVaultsCursor | null;
  /** Every public vault's category, most recently updated first. Only on a first page. */
  categories: string[] | null;
}

export interface CodexVaultsQuery {
  /** Matches the name, description, abstract or category, case-insensitively. */
  search?: string;
  /** Exact category, or null for all. */
  category?: string | null;
  limit?: number;
  after?: CodexVaultsCursor | null;
}

export const CODEX_PAGE_SIZE = 36;

/** One page of public vaults, newest first (supabase/migrations/20261128220000_codex_functions.sql). */
export async function fetchCodexVaultsPage(supabase: SupabaseClient, query: CodexVaultsQuery = {}): Promise<CodexVaultsPage> {
  const { data, error } = await supabase.rpc('get_codex_vaults', {
    p_search: query.search || null,
    p_category: query.category ?? null,
    p_limit: query.limit ?? CODEX_PAGE_SIZE,
    p_after_updated_at: query.after?.updated_at ?? null,
    p_after_id: query.after?.id ?? null,
  });
  if (error) throw error;
  return data as unknown as CodexVaultsPage;
}

export interface CodexTopicSuggestion {
  topic: string;
  /** How many public papers carry it as a keyword or tag. */
  papers: number;
}

/** The most common topics on public papers, optionally only those containing `query`. */
export async function fetchCodexTopicSuggestions(supabase: SupabaseClient, query: string, limit = 12): Promise<CodexTopicSuggestion[]> {
  const { data, error } = await supabase.rpc('get_codex_topics', { p_query: query || null, p_limit: limit });
  if (error) throw error;
  return (data as unknown as CodexTopicSuggestion[]) ?? [];
}
