import { describe, expect, it, vi } from 'vitest';

import { replacePublicationPdfAsset, type PdfAssetRecord } from './pdfAssets';

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
