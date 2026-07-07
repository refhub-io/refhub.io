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

import { uploadPublicationDrivePdf, uploadVaultPublicationDrivePdf } from './pdfUpload';

function mockResumableFetchSequence() {
  return vi
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
      new Response(JSON.stringify({ data: { fileId: 'drive-file', driveUrl: 'https://drive.example/file', provider: 'google_drive', stored: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
}

describe('uploadVaultPublicationDrivePdf', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('always uses session, direct Drive PUT, and complete routes, regardless of file size', async () => {
    const fetchMock = mockResumableFetchSequence();
    vi.stubGlobal('fetch', fetchMock);

    const smallFile = new File(['small'], 'paper.pdf', { type: 'application/pdf' });
    const result = await uploadVaultPublicationDrivePdf('vault id', 'item id', smallFile);

    expect(result.driveUrl).toBe('https://drive.example/file');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.test/api/v1/google-drive/vaults/vault%20id/items/item%20id/pdf/session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://drive-upload.example/session',
      expect.objectContaining({
        method: 'PUT',
        body: smallFile,
        headers: { 'Content-Type': 'application/pdf' },
      }),
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

describe('uploadPublicationDrivePdf', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the publication-level session, direct Drive PUT, and complete routes', async () => {
    const fetchMock = mockResumableFetchSequence();
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['content'], 'paper.pdf', { type: 'application/pdf' });
    const result = await uploadPublicationDrivePdf('pub id', file);

    expect(result.driveUrl).toBe('https://drive.example/file');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.test/api/v1/publications/pub%20id/pdf/session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.example.test/api/v1/publications/pub%20id/pdf/complete',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
