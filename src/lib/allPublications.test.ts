import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPublicationsData } from './allPublications';
import type { Publication, PublicationTag, Tag, Vault } from '@/types/database';
import type { RawVaultPublicationRow } from './publicationAggregate';

// Simulates the real Supabase chained query builder for exactly the call
// shapes fetchAllPublicationsData issues:
//   .from('publications').select('*').order(...)
//   .from('vaults').select('*').eq('user_id', ...).order('name')
//   .from('vaults').select('*').in('id', [...])                (shared vault details)
//   .from('vault_shares').select(...).or(...)
//   .from('vault_publications').select('*').order(...)
//   .from('publication_tags').select('*')
//   .from('tags').select('*').eq('user_id', ...).is('vault_id', null).order('name')
//   .from('tags').select('*').in('vault_id', [...]).order('name')
// Each branch (eq vs in, for 'vaults' and 'tags') is distinguished by which
// method is called, mirroring how the real query builder supports either
// continuation from the same select() call.
function makeClient(data: {
  publications?: Publication[];
  ownedVaults?: Vault[];
  sharedVaultDetails?: Vault[];
  vaultShares?: { vault_id: string; role?: string }[];
  vaultPublications?: RawVaultPublicationRow[];
  publicationTags?: PublicationTag[];
  personalTags?: Tag[];
  vaultTags?: Tag[];
}): SupabaseClient {
  const from = vi.fn((table: string) => {
    switch (table) {
      case 'publications':
        return {
          select: () => ({
            order: () => Promise.resolve({ data: data.publications ?? [], error: null }),
          }),
        };
      case 'vault_publications':
        return {
          select: () => ({
            order: () => Promise.resolve({ data: data.vaultPublications ?? [], error: null }),
          }),
        };
      case 'publication_tags':
        return {
          select: () => Promise.resolve({ data: data.publicationTags ?? [], error: null }),
        };
      case 'vault_shares':
        return {
          select: () => ({
            or: () => Promise.resolve({ data: data.vaultShares ?? [], error: null }),
          }),
        };
      case 'vaults':
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: data.ownedVaults ?? [], error: null }),
            }),
            in: () => Promise.resolve({ data: data.sharedVaultDetails ?? [], error: null }),
          }),
        };
      case 'tags':
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                order: () => Promise.resolve({ data: data.personalTags ?? [], error: null }),
              }),
            }),
            in: () => ({
              order: () => Promise.resolve({ data: data.vaultTags ?? [], error: null }),
            }),
          }),
        };
      default:
        throw new Error(`Unexpected table in test mock: ${table}`);
    }
  });

  return { from } as unknown as SupabaseClient;
}

describe('fetchAllPublicationsData', () => {
  it('returns an empty aggregate when the user has no data', async () => {
    const client = makeClient({});
    const result = await fetchAllPublicationsData(client, 'user-1', 'user@example.com');

    expect(result.publications).toEqual([]);
    expect(result.vaults).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.publicationVaultsMap).toEqual({});
    expect(result.publicationTagsMap).toEqual({});
  });

  it('merges canonical publications with vault copies into one aggregate', async () => {
    const canonical: Publication = {
      id: 'p1', user_id: 'user-1', title: 'Paper', authors: ['A'], year: 2020,
      journal: null, volume: null, issue: null, pages: null, doi: null, url: null,
      abstract: null, pdf_url: null, bibtex_key: null, publication_type: 'article',
      notes: null, booktitle: null, chapter: null, edition: null, editor: null,
      howpublished: null, institution: null, number: null, organization: null,
      publisher: null, school: null, series: null, type: null, eid: null,
      isbn: null, issn: null, keywords: null, reading_state: 'unread',
      important: false, created_at: 'now', updated_at: 'now',
    };
    const ownedVault: Vault = {
      id: 'vault-1', user_id: 'user-1', name: 'My Vault', description: null,
      color: '#fff', visibility: 'private', public_slug: null, category: null,
      abstract: null, created_at: 'now', updated_at: 'now',
    };
    const vp: RawVaultPublicationRow = {
      id: 'vp1', vault_id: 'vault-1', created_by: 'user-1', title: 'Paper',
      authors: ['A'], year: 2020, journal: null, volume: null, issue: null,
      pages: null, doi: null, url: null, abstract: 'filled in', pdf_url: null,
      bibtex_key: null, publication_type: 'article', notes: null, booktitle: null,
      chapter: null, edition: null, editor: null, howpublished: null,
      institution: null, number: null, organization: null, publisher: null,
      school: null, series: null, type: null, eid: null, isbn: null, issn: null,
      keywords: null, created_at: 'now', updated_at: 'now',
      original_publication_id: 'p1',
    };

    const client = makeClient({
      publications: [canonical],
      ownedVaults: [ownedVault],
      vaultPublications: [vp],
    });
    const result = await fetchAllPublicationsData(client, 'user-1', 'user@example.com');

    expect(result.publications).toHaveLength(1);
    expect(result.publications[0].abstract).toBe('filled in');
    expect(result.publicationVaultsMap.p1).toEqual(['vault-1']);
    expect(result.vaults.map((v) => v.id)).toEqual(['vault-1']);
  });

  it('includes shared vaults and scopes tags to accessible vaults', async () => {
    const ownedVault: Vault = {
      id: 'vault-1', user_id: 'user-1', name: 'Owned', description: null,
      color: '#fff', visibility: 'private', public_slug: null, category: null,
      abstract: null, created_at: 'now', updated_at: 'now',
    };
    const sharedVault: Vault = {
      id: 'vault-2', user_id: 'user-2', name: 'Shared', description: null,
      color: '#000', visibility: 'private', public_slug: null, category: null,
      abstract: null, created_at: 'now', updated_at: 'now',
    };
    const personalTag: Tag = {
      id: 'tag-1', user_id: 'user-1', name: 'Personal', color: '#111',
      parent_id: null, depth: 0, created_at: 'now', vault_id: null,
    };
    const vaultTag: Tag = {
      id: 'tag-2', user_id: 'user-2', name: 'VaultTag', color: '#222',
      parent_id: null, depth: 0, created_at: 'now', vault_id: 'vault-2',
    };

    const client = makeClient({
      ownedVaults: [ownedVault],
      vaultShares: [{ vault_id: 'vault-2', role: 'viewer' }],
      sharedVaultDetails: [sharedVault],
      personalTags: [personalTag],
      vaultTags: [vaultTag],
    });
    const result = await fetchAllPublicationsData(client, 'user-1', 'user@example.com');

    expect(result.vaults.map((v) => v.id).sort()).toEqual(['vault-1', 'vault-2']);
    expect(result.tags.map((t) => t.id).sort()).toEqual(['tag-1', 'tag-2']);
  });
});
