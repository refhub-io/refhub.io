import { describe, expect, it, vi } from 'vitest';

import { replacePublicationPdfAsset, syncDrivePdfAsset, type PdfAssetRecord } from './pdfAssets';

function makeQuery(method: 'delete' | 'insert', calls: string[], result = { error: null }) {
  return {
    eq(column: string, value: unknown) {
      calls.push(`${method}.eq:${column}:${String(value)}`);
      return this;
    },
    is(column: string, value: unknown) {
      calls.push(`${method}.is:${column}:${String(value)}`);
      return this;
    },
    then(resolve: (value: typeof result) => void) {
      resolve(result);
    },
  };
}

function makeClient(result = { error: null }) {
  const calls: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      expect(table).toBe('publication_pdf_assets');
      return {
        delete: vi.fn(() => {
          calls.push('delete');
          return makeQuery('delete', calls, result);
        }),
        insert: vi.fn((record: PdfAssetRecord) => {
          calls.push(`insert:${record.publication_id}:${record.vault_publication_id}:${record.stored_pdf_url}`);
          return makeQuery('insert', calls, result);
        }),
      };
    }),
  };

  return { client, calls };
}

const baseRecord: PdfAssetRecord = {
  user_id: 'user-1',
  publication_id: 'pub-1',
  vault_publication_id: null,
  storage_provider: 'google_drive',
  stored_pdf_url: 'https://drive.example/pdf',
  stored_file_id: null,
  status: 'stored',
  error_message: null,
};

describe('replacePublicationPdfAsset', () => {
  it('deletes the canonical row before inserting without an invalid PostgREST on_conflict target', async () => {
    const { client, calls } = makeClient();

    await replacePublicationPdfAsset(client, baseRecord);

    expect(calls).toEqual([
      'delete',
      'delete.eq:publication_id:pub-1',
      'delete.is:vault_publication_id:null',
      'delete.eq:storage_provider:google_drive',
      'insert:pub-1:null:https://drive.example/pdf',
    ]);
  });

  it('only deletes the canonical row when clearing the asset URL', async () => {
    const { client, calls } = makeClient();

    await replacePublicationPdfAsset(client, {
      ...baseRecord,
      stored_pdf_url: null,
      status: 'removed',
    });

    expect(calls).toEqual([
      'delete',
      'delete.eq:publication_id:pub-1',
      'delete.is:vault_publication_id:null',
      'delete.eq:storage_provider:google_drive',
    ]);
  });
});

function makeSyncClient(
  siblings: { id: string; vault_id: string }[] = [],
  vaultOwners: { id: string; user_id: string }[] = [],
) {
  const calls: string[] = [];
  const pdfAssetsQuery = (result = { error: null }) => ({
    eq(column: string, value: unknown) {
      calls.push(`eq:${column}:${String(value)}`);
      return this;
    },
    is(column: string, value: unknown) {
      calls.push(`is:${column}:${String(value)}`);
      return this;
    },
    then(resolve: (value: typeof result) => void) {
      resolve(result);
    },
  });

  const vaultsQuery = () => {
    const query: Record<string, unknown> = {
      select: vi.fn((cols: string) => {
        calls.push(`vaults.select:${cols}`);
        return query;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        calls.push(`vaults.in:${column}:${values.join(',')}`);
        return query;
      }),
      then(resolve: (value: { data: typeof vaultOwners; error: null }) => void) {
        resolve({ data: vaultOwners, error: null });
      },
    };
    return query;
  };

  const vaultPublicationsQuery = () => {
    const query: Record<string, unknown> = {
      select: vi.fn((cols: string) => {
        calls.push(`vp.select:${cols}`);
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        calls.push(`vp.eq:${column}:${String(value)}`);
        return query;
      }),
      neq: vi.fn((column: string, value: unknown) => {
        calls.push(`vp.neq:${column}:${String(value)}`);
        return query;
      }),
      then(resolve: (value: { data: typeof siblings; error: null }) => void) {
        resolve({ data: siblings, error: null });
      },
    };
    return query;
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'vault_publications') return vaultPublicationsQuery();
      if (table === 'vaults') return vaultsQuery();

      expect(table).toBe('publication_pdf_assets');
      return {
        upsert: vi.fn((record: unknown) => {
          calls.push(`upsert:${JSON.stringify(record)}`);
          return pdfAssetsQuery();
        }),
        delete: vi.fn(() => {
          calls.push('delete');
          return pdfAssetsQuery();
        }),
        insert: vi.fn((record: PdfAssetRecord) => {
          calls.push(`insert:${record.publication_id}:${record.vault_publication_id}:${record.stored_pdf_url}`);
          return pdfAssetsQuery();
        }),
      };
    }),
  };

  return { client, calls };
}

describe('syncDrivePdfAsset', () => {
  it('upserts the origin vault copy, mirrors to canonical, and fans out to every sibling vault (no ownership restriction)', async () => {
    const { client, calls } = makeSyncClient(
      [{ id: 'vault-pub-sibling', vault_id: 'vault-b' }],
      [{ id: 'vault-b', user_id: 'user-2' }],
    );

    await syncDrivePdfAsset(client, {
      userId: 'user-1',
      publicationId: 'pub-1',
      storedPdfUrl: 'https://drive.example/pdf',
      originVaultPublicationId: 'vault-pub-origin',
    });

    const originUpsert = calls.find((c) => c.startsWith('upsert:') && c.includes('vault-pub-origin'));
    expect(originUpsert).toContain('"stored_pdf_url":"https://drive.example/pdf"');
    expect(originUpsert).toContain('"status":"stored"');
    expect(originUpsert).toContain('"user_id":"user-1"');

    expect(calls).toContain('delete');
    expect(calls).toContain('insert:pub-1:null:https://drive.example/pdf');

    expect(calls).toContain('vp.eq:original_publication_id:pub-1');
    expect(calls).toContain('vp.neq:id:vault-pub-origin');
    expect(calls).toContain('vaults.in:id:vault-b');

    // Sibling belongs to a vault owned by a different user (user-2) --
    // attributed to that vault's real owner, not the acting editor.
    const siblingUpsert = calls.find((c) => c.startsWith('upsert:') && c.includes('vault-pub-sibling'));
    expect(siblingUpsert).toContain('"stored_pdf_url":"https://drive.example/pdf"');
    expect(siblingUpsert).toContain('"user_id":"user-2"');
  });

  it('falls back to the acting user for a sibling whose vault owner lookup comes back empty', async () => {
    const { client, calls } = makeSyncClient(
      [{ id: 'vault-pub-sibling', vault_id: 'vault-b' }],
      [], // owner lookup returns nothing (e.g. RLS-restricted)
    );

    await syncDrivePdfAsset(client, {
      userId: 'user-1',
      publicationId: 'pub-1',
      storedPdfUrl: 'https://drive.example/pdf',
    });

    const siblingUpsert = calls.find((c) => c.startsWith('upsert:') && c.includes('vault-pub-sibling'));
    expect(siblingUpsert).toContain('"user_id":"user-1"');
  });

  it('clearing the URL upserts null/removed everywhere instead of deleting vault-scoped rows', async () => {
    const { client, calls } = makeSyncClient(
      [{ id: 'vault-pub-sibling', vault_id: 'vault-a' }],
      [{ id: 'vault-a', user_id: 'user-1' }],
    );

    await syncDrivePdfAsset(client, {
      userId: 'user-1',
      publicationId: 'pub-1',
      storedPdfUrl: null,
      originVaultPublicationId: 'vault-pub-origin',
    });

    const originUpsert = calls.find((c) => c.startsWith('upsert:') && c.includes('vault-pub-origin'));
    expect(originUpsert).toContain('"stored_pdf_url":null');
    expect(originUpsert).toContain('"status":"removed"');

    // Canonical row is deleted (not upserted-null), matching replacePublicationPdfAsset.
    expect(calls).toContain('delete');
    expect(calls.some((c) => c.startsWith('insert:'))).toBe(false);

    const siblingUpsert = calls.find((c) => c.startsWith('upsert:') && c.includes('vault-pub-sibling'));
    expect(siblingUpsert).toContain('"stored_pdf_url":null');
    expect(siblingUpsert).toContain('"status":"removed"');
  });

  it('editing from the canonical publication (no origin vault copy) fans out to every vault copy, unfiltered', async () => {
    const { client, calls } = makeSyncClient(
      [{ id: 'vault-pub-a', vault_id: 'vault-a' }, { id: 'vault-pub-b', vault_id: 'vault-b' }],
      [{ id: 'vault-a', user_id: 'user-1' }, { id: 'vault-b', user_id: 'user-2' }],
    );

    await syncDrivePdfAsset(client, {
      userId: 'user-1',
      publicationId: 'pub-1',
      storedPdfUrl: 'https://drive.example/pdf',
    });

    // No direct origin-row upsert without an originVaultPublicationId, and no
    // sibling exclusion filter (every vault copy should be included).
    expect(calls.some((c) => c.startsWith('upsert:') && c.includes('"vault_publication_id":null'))).toBe(false);
    expect(calls.some((c) => c.startsWith('vp.neq'))).toBe(false);

    expect(calls.some((c) => c.startsWith('upsert:') && c.includes('vault-pub-a'))).toBe(true);
    expect(calls.some((c) => c.startsWith('upsert:') && c.includes('vault-pub-b'))).toBe(true);
  });

  it('does nothing beyond the origin row when the publication has no canonical link', async () => {
    const { client, calls } = makeSyncClient();

    await syncDrivePdfAsset(client, {
      userId: 'user-1',
      publicationId: null,
      storedPdfUrl: 'https://drive.example/pdf',
      originVaultPublicationId: 'vault-pub-origin',
    });

    expect(calls).toEqual([expect.stringContaining('upsert:')]);
    expect(calls.some((c) => c.startsWith('vaults.select') || c.startsWith('vp.select'))).toBe(false);
  });

  it('does not query vault owners when there are no sibling vault copies at all', async () => {
    const { client, calls } = makeSyncClient([]);

    await syncDrivePdfAsset(client, {
      userId: 'user-1',
      publicationId: 'pub-1',
      storedPdfUrl: 'https://drive.example/pdf',
    });

    expect(calls.some((c) => c.startsWith('vaults.'))).toBe(false);
  });
});
