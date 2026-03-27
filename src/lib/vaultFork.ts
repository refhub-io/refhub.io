import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface VaultForkInfo {
  forkedFrom: {
    id: string;
    name: string;
    public_slug: string | null;
    owner: { display_name: string | null; username: string | null } | null;
  } | null;
}

function slugifyVaultName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

async function createUniquePublicSlug(baseName: string): Promise<string> {
  const baseSlug = slugifyVaultName(baseName) || 'vault-fork';

  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const { data: existingVault, error } = await supabase
      .from('vaults')
      .select('id')
      .eq('public_slug', candidate)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!existingVault) {
      return candidate;
    }
  }

  throw new Error('failed to generate a unique public slug for forked vault');
}

export function getForkSourceHref(forkedFrom: NonNullable<VaultForkInfo['forkedFrom']>): string {
  return forkedFrom.public_slug ? `/public/${forkedFrom.public_slug}` : `/vault/${forkedFrom.id}`;
}

export function getForkSourceLabel(forkedFrom: NonNullable<VaultForkInfo['forkedFrom']>): string {
  const ownerLabel =
    forkedFrom.owner?.username ||
    forkedFrom.owner?.display_name ||
    'unknown';

  return `<${ownerLabel}:${forkedFrom.name}>`;
}

/**
 * Fork a public vault: copies the vault row and all vault_publications,
 * records the fork relationship, and returns the new vault id.
 */
export async function forkVault(originalVaultId: string, user: User): Promise<string> {
  // Fetch the original vault
  const { data: original, error: fetchErr } = await supabase
    .from('vaults')
    .select('*')
    .eq('id', originalVaultId)
    .eq('visibility', 'public')
    .single();

  if (fetchErr || !original) {
    throw new Error(fetchErr?.message ?? 'vault not found or not public');
  }

  const publicSlug = await createUniquePublicSlug(`${original.name}-fork`);

  // Forked vaults are always public and receive a public slug.
  const { data: newVault, error: vaultErr } = await supabase
    .from('vaults')
    .insert({
      user_id: user.id,
      name: `${original.name} (Fork)`,
      description: original.description,
      color: original.color,
      category: original.category,
      abstract: original.abstract,
      visibility: 'public',
      public_slug: publicSlug,
    })
    .select('id')
    .single();

  if (vaultErr || !newVault) {
    throw new Error(vaultErr?.message ?? 'failed to create vault');
  }

  // Record the fork relationship
  const { error: forkErr } = await supabase
    .from('vault_forks')
    .insert({
      original_vault_id: originalVaultId,
      forked_vault_id: newVault.id,
      forked_by: user.id,
    });

  if (forkErr) throw new Error(forkErr.message);

  // Copy all vault_publications from the original vault
  const { data: originalPubs } = await supabase
    .from('vault_publications')
    .select('*')
    .eq('vault_id', originalVaultId);

  if (originalPubs && originalPubs.length > 0) {
    const copies = originalPubs.map(p => ({
      vault_id: newVault.id,
      original_publication_id: p.original_publication_id,
      title: p.title,
      authors: p.authors,
      year: p.year,
      journal: p.journal,
      volume: p.volume,
      issue: p.issue,
      pages: p.pages,
      doi: p.doi,
      url: p.url,
      abstract: p.abstract,
      pdf_url: p.pdf_url,
      bibtex_key: p.bibtex_key,
      publication_type: p.publication_type,
      notes: p.notes,
      booktitle: p.booktitle,
      chapter: p.chapter,
      edition: p.edition,
      editor: p.editor,
      howpublished: p.howpublished,
      institution: p.institution,
      number: p.number,
      organization: p.organization,
      publisher: p.publisher,
      school: p.school,
      series: p.series,
      type: p.type,
      eid: p.eid,
      isbn: p.isbn,
      issn: p.issn,
      keywords: p.keywords,
      created_by: user.id,
    }));

    const { error: pubErr } = await supabase.from('vault_publications').insert(copies);
    if (pubErr) throw new Error(pubErr.message);
  }

  return newVault.id;
}

/**
 * Get attribution info for a forked vault.
 * Returns the original vault name, slug, and owner profile if this vault is a fork.
 */
export async function getVaultForkInfo(vaultId: string): Promise<VaultForkInfo> {
  const { data: forkRecord } = await supabase
    .from('vault_forks')
    .select('original_vault_id')
    .eq('forked_vault_id', vaultId)
    .maybeSingle();

  if (!forkRecord) return { forkedFrom: null };

  const { data: originalVault } = await supabase
    .from('vaults')
    .select('id, name, public_slug, user_id')
    .eq('id', forkRecord.original_vault_id)
    .maybeSingle();

  if (!originalVault) return { forkedFrom: null };

  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('user_id', originalVault.user_id)
    .maybeSingle();

  return {
    forkedFrom: {
      id: originalVault.id,
      name: originalVault.name,
      public_slug: originalVault.public_slug,
      owner: ownerProfile ?? null,
    },
  };
}

/**
 * Count the number of forks for a given vault.
 */
export async function getVaultForkCount(vaultId: string): Promise<number> {
  const { count } = await supabase
    .from('vault_forks')
    .select('*', { count: 'exact', head: true })
    .eq('original_vault_id', vaultId);

  return count ?? 0;
}
