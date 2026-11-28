import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPublicationsData } from './allPublications';
import type { Publication, PublicationTag, Tag, Vault } from '@/types/database';
import type { RawVaultPublicationRow } from './publicationAggregate';

// Simulates the two things fetchAllPublicationsData asks Supabase for:
//   supabase.rpc('get_library')                                 (papers, tag links, tags)
//   .from('vaults').select('*').eq('user_id', ...).order('name')
//   .from('vaults').select('*').in('id', [...])                (shared vault details)
//   .from('vault_shares').select(...).or(...)
// The library tables have no .from() branch: querying one directly throws, which is how these
// tests check the loader doesn't go back to unscoped selects (#275). An error configured for any
// library table makes the RPC fail, since the server returns the library whole or not at all.

type MockError = { message: string };

/** Resolves to an error response if one is configured for `key`, else to `rows`. */
function resolveOrError<T>(rows: T[] | undefined, error: MockError | undefined) {
  if (error) return Promise.resolve({ data: null, error });
  return Promise.resolve({ data: rows ?? [], error: null });
}

function makeClient(data: {
  publications?: Publication[];
  ownedVaults?: Vault[];
  sharedVaultDetails?: Vault[];
  vaultShares?: { vault_id: string; role?: string }[];
  vaultPublications?: RawVaultPublicationRow[];
  publicationTags?: PublicationTag[];
  personalTags?: Tag[];
  vaultTags?: Tag[];
  errors?: {
    publications?: MockError;
    ownedVaults?: MockError;
    vaultShares?: MockError;
    vaultPublications?: MockError;
    publicationTags?: MockError;
    sharedVaultDetails?: MockError;
    personalTags?: MockError;
    vaultTags?: MockError;
  };
}): SupabaseClient {
  const errors = data.errors ?? {};
  const from = vi.fn((table: string) => {
    switch (table) {
      case 'vault_shares':
        return {
          select: () => ({
            or: () => resolveOrError(data.vaultShares, errors.vaultShares),
          }),
        };
      case 'vaults':
        return {
          select: () => ({
            eq: () => ({
              order: () => resolveOrError(data.ownedVaults, errors.ownedVaults),
            }),
            in: () => resolveOrError(data.sharedVaultDetails, errors.sharedVaultDetails),
          }),
        };
      default:
        throw new Error(`Unexpected table in test mock: ${table}`);
    }
  });

  const libraryError = errors.publications ?? errors.vaultPublications ?? errors.publicationTags
    ?? errors.personalTags ?? errors.vaultTags;
  const rpc = vi.fn((fn: string) => {
    if (fn !== 'get_library') throw new Error(`Unexpected RPC in test mock: ${fn}`);
    if (libraryError) return Promise.resolve({ data: null, error: libraryError });
    return Promise.resolve({
      data: {
        publications: data.publications ?? [],
        vault_publications: data.vaultPublications ?? [],
        publication_tags: data.publicationTags ?? [],
        publication_relations: [],
        pdf_assets: [],
        tags: [...(data.personalTags ?? []), ...(data.vaultTags ?? [])],
      },
      error: null,
    });
  });
  return { from, rpc } as unknown as SupabaseClient;
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
    expect(result.tagsIncomplete).toBe(false);
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
      abstract: null, archived_at: null, created_at: 'now', updated_at: 'now',
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
      abstract: null, archived_at: null, created_at: 'now', updated_at: 'now',
    };
    const sharedVault: Vault = {
      id: 'vault-2', user_id: 'user-2', name: 'Shared', description: null,
      color: '#000', visibility: 'private', public_slug: null, category: null,
      abstract: null, archived_at: null, created_at: 'now', updated_at: 'now',
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

  it('rejects when the library RPC errors, instead of returning an empty result', async () => {
    const client = makeClient({ errors: { publications: { message: 'permission denied for table publications' } } });

    await expect(fetchAllPublicationsData(client, 'user-1', 'user@example.com')).rejects.toMatchObject({
      message: 'permission denied for table publications',
    });
  });

  it('rejects when the shared-vault-detail lookup errors', async () => {
    const client = makeClient({
      vaultShares: [{ vault_id: 'vault-2' }],
      errors: { sharedVaultDetails: { message: 'network error' } },
    });

    await expect(fetchAllPublicationsData(client, 'user-1', 'user@example.com')).rejects.toMatchObject({
      message: 'network error',
    });
  });

  it('rejects when the library errors on tags', async () => {
    const client = makeClient({ errors: { personalTags: { message: 'tags query failed' } } });

    await expect(fetchAllPublicationsData(client, 'user-1', 'user@example.com')).rejects.toMatchObject({
      message: 'tags query failed',
    });
  });

  it('rejects when tag links fail: they arrive with the rest of the library, never partially', async () => {
    const client = makeClient({ errors: { publicationTags: { message: 'canceling statement due to statement timeout' } } });
    await expect(fetchAllPublicationsData(client, 'user-1', 'user@example.com')).rejects.toMatchObject({
      message: 'canceling statement due to statement timeout',
    });
  });

  it('asks the server for the library in one call, and never selects library tables directly', async () => {
    const client = makeClient({});
    await fetchAllPublicationsData(client, 'user-1', 'user@example.com');
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith('get_library');
    const tables = (client.from as ReturnType<typeof vi.fn>).mock.calls.map(([table]) => table);
    expect(tables.every((table) => table === 'vaults' || table === 'vault_shares')).toBe(true);
  });
});
