import { describe, expect, it, vi, beforeEach } from 'vitest';
import { parseS2PaperIdFromUrl, fetchS2UrlMetadata } from './s2UrlLookup';

vi.mock('./bibtex', () => ({ getAccessToken: vi.fn().mockResolvedValue('token-123') }));
vi.mock('@/lib/apiKeys', () => ({ getBackendApiBaseUrl: () => 'https://backend.example.com' }));

describe('parseS2PaperIdFromUrl', () => {
  it('extracts the paper id from a semanticscholar.org paper URL', () => {
    expect(parseS2PaperIdFromUrl('https://www.semanticscholar.org/paper/Some-Title/abc123def456'))
      .toBe('abc123def456');
  });
  it('returns null for an unrelated URL', () => {
    expect(parseS2PaperIdFromUrl('https://example.com/not-s2')).toBeNull();
  });
});

describe('fetchS2UrlMetadata', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('posts { s2_paper_id } to the same /doi-metadata route fetchDOIMetadata uses', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ data: { title: 'Some Paper', authors: ['A'], doi: '' } }),
    } as Response);
    const result = await fetchS2UrlMetadata('abc123def456');
    expect(fetchSpy).toHaveBeenCalledWith('https://backend.example.com/doi-metadata', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ s2_paper_id: 'abc123def456' }),
    }));
    expect(result?.title).toBe('Some Paper');
  });

  it('returns null (not throws) when the backend does not yet recognize s2_paper_id', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({}) } as Response);
    expect(await fetchS2UrlMetadata('abc123def456')).toBeNull();
  });
});
