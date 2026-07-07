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

function makeSyncClient(siblingIds: string[] = []) {
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
    in(column: string, values: unknown[]) {
      calls.push(`in:${column}:${values.join(',')}`);
      return this;
    },
    then(resolve: (value: typeof result) => void) {
      resolve(result);
    },
  });

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
      then(resolve: (value: { data: { id: string }[]; error: null }) => void) {
        resolve({ data: siblingIds.map((id) => ({ id })), error: null });
      },
    };
    return query;
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'vault_publications') return vaultPublicationsQuery();

      expect(table).toBe('publication_pdf_assets');
      return {
        upsert: vi.fn((record: unknown) => {
          calls.push(`upsert:${JSON.stringify(record)}`);
          return pdfAssetsQuery();
        }),
        update: vi.fn((record: unknown) => {
          calls.push(`update:${JSON.stringify(record)}`);
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
  it('upserts the origin vault copy, mirrors to canonical, and bulk-updates sibling override rows', async () => {
    const { client, calls } = makeSyncClient(['vault-pub-sibling']);

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

    // Siblings get one bulk UPDATE, not a per-row upsert -- no user_id
    // touched, no vault-ownership lookup needed at all.
    const siblingUpdate = calls.find((c) => c.startsWith('update:'));
    expect(siblingUpdate).toContain('"stored_pdf_url":"https://drive.example/pdf"');
    expect(siblingUpdate).not.toContain('user_id');
    expect(calls).toContain('eq:storage_provider:google_drive');
    expect(calls).toContain('in:vault_publication_id:vault-pub-sibling');
  });

  it('clearing the URL upserts the origin row null/removed and bulk-updates siblings the same way', async () => {
    const { client, calls } = makeSyncClient(['vault-pub-sibling']);

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

    const siblingUpdate = calls.find((c) => c.startsWith('update:'));
    expect(siblingUpdate).toContain('"stored_pdf_url":null');
    expect(siblingUpdate).toContain('"status":"removed"');
  });

  it('editing from the canonical publication (no origin vault copy) updates every vault copy, unfiltered', async () => {
    const { client, calls } = makeSyncClient(['vault-pub-a', 'vault-pub-b']);

    await syncDrivePdfAsset(client, {
      userId: 'user-1',
      publicationId: 'pub-1',
      storedPdfUrl: 'https://drive.example/pdf',
    });

    // No direct origin-row upsert without an originVaultPublicationId, and no
    // sibling exclusion filter (every vault copy should be included).
    expect(calls.some((c) => c.startsWith('upsert:'))).toBe(false);
    expect(calls.some((c) => c.startsWith('vp.neq'))).toBe(false);

    expect(calls).toContain('in:vault_publication_id:vault-pub-a,vault-pub-b');
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
    expect(calls.some((c) => c.startsWith('vp.select'))).toBe(false);
  });

  it('does not issue a sibling update when there are no sibling vault copies at all', async () => {
    const { client, calls } = makeSyncClient([]);

    await syncDrivePdfAsset(client, {
      userId: 'user-1',
      publicationId: 'pub-1',
      storedPdfUrl: 'https://drive.example/pdf',
    });

    expect(calls.some((c) => c.startsWith('update:'))).toBe(false);
  });
});
