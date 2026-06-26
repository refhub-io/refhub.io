import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/apiKeys', () => ({
  getBackendApiBaseUrl: () => 'https://api.example.test/api/v1',
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'session-token' } }, error: null })),
    },
  },
}));

import { API_SAFE_RAW_PDF_UPLOAD_BYTES, uploadVaultPublicationDrivePdf } from './pdfUpload';

describe('uploadVaultPublicationDrivePdf', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps small vault PDFs on the raw backend upload route', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { fileId: 'drive-file', pdfUrl: 'https://drive.example/file', provider: 'google_drive', stored: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['small'], 'paper.pdf', { type: 'application/pdf' });
    const result = await uploadVaultPublicationDrivePdf('vault id', 'item id', file);

    expect(result.fileId).toBe('drive-file');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/google-drive/vaults/vault%20id/items/item%20id/pdf',
      expect.objectContaining({ method: 'POST', body: file }),
    );
  });

  it('uses session, direct Drive PUT, and complete routes for large vault PDFs', async () => {
    const largeFile = new File([new Uint8Array(API_SAFE_RAW_PDF_UPLOAD_BYTES + 1)], 'large.pdf', { type: 'application/pdf' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { upload_url: 'https://drive-upload.example/session' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'drive-file', webViewLink: 'https://drive.example/file' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { fileId: 'drive-file', pdfUrl: 'https://drive.example/file', provider: 'google_drive', stored: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadVaultPublicationDrivePdf('vault id', 'item id', largeFile);

    expect(result.pdfUrl).toBe('https://drive.example/file');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.test/api/v1/google-drive/vaults/vault%20id/items/item%20id/pdf/session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://drive-upload.example/session',
      expect.objectContaining({ method: 'PUT', body: largeFile }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.example.test/api/v1/google-drive/vaults/vault%20id/items/item%20id/pdf/complete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ file_id: 'drive-file', web_view_link: 'https://drive.example/file' }),
      }),
    );
  });
});
