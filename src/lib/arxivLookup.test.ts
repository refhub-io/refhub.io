import { describe, expect, it, vi, beforeEach } from 'vitest';
import { normalizeArxivId, arxivIdToDoi, fetchArxivMetadata } from './arxivLookup';

const mockFetchDOIMetadata = vi.fn();
vi.mock('./bibtex', () => ({ fetchDOIMetadata: (doi: string) => mockFetchDOIMetadata(doi) }));

describe('normalizeArxivId', () => {
  it('accepts a bare arXiv id', () => {
    expect(normalizeArxivId('2301.12345')).toBe('2301.12345');
  });
  it('extracts the id (with version) from an abs URL', () => {
    expect(normalizeArxivId('https://arxiv.org/abs/2301.12345v2')).toBe('2301.12345v2');
  });
  it('extracts the id from a pdf URL', () => {
    expect(normalizeArxivId('https://arxiv.org/pdf/2301.12345')).toBe('2301.12345');
  });
  it('returns null for unrelated input', () => {
    expect(normalizeArxivId('not an arxiv id')).toBeNull();
  });
});

describe('arxivIdToDoi', () => {
  it('builds the auto-minted DOI, stripping any version suffix', () => {
    expect(arxivIdToDoi('2301.12345v2')).toBe('10.48550/arXiv.2301.12345');
  });
  it('handles an id with no version suffix', () => {
    expect(arxivIdToDoi('2301.12345')).toBe('10.48550/arXiv.2301.12345');
  });
});

describe('fetchArxivMetadata', () => {
  beforeEach(() => { mockFetchDOIMetadata.mockReset(); });

  it('calls fetchDOIMetadata with the computed arXiv DOI', async () => {
    mockFetchDOIMetadata.mockResolvedValue({ title: 'Some Paper', authors: ['A'], doi: '10.48550/arXiv.2301.12345' });
    const result = await fetchArxivMetadata('2301.12345');
    expect(mockFetchDOIMetadata).toHaveBeenCalledWith('10.48550/arXiv.2301.12345');
    expect(result?.title).toBe('Some Paper');
  });

  it('returns null (not throws) when fetchDOIMetadata throws — an older paper with no minted DOI', async () => {
    mockFetchDOIMetadata.mockRejectedValue(new Error('DOI not found in CrossRef, OpenAlex, or Semantic Scholar'));
    expect(await fetchArxivMetadata('9901.001')).toBeNull();
  });
});
