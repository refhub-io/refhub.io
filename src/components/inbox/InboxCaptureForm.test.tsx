import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { dismissQuoterm, getQuotermsSnapshot } from 'quoterm';
import { InboxCaptureForm } from './InboxCaptureForm';

const mockCreateItem = vi.fn();
vi.mock('@/hooks/useInbox', () => ({ useInbox: () => ({ createItem: mockCreateItem }) }));

const mockFetchDOIMetadata = vi.fn();
const mockParseBibtex = vi.fn();
vi.mock('@/lib/bibtex', () => ({
  fetchDOIMetadata: (doi: string) => mockFetchDOIMetadata(doi),
  parseBibtex: (text: string) => mockParseBibtex(text),
  generateBibtexKey: vi.fn().mockReturnValue('key2020'),
}));

const mockNormalizeArxivId = vi.fn();
const mockFetchArxivMetadata = vi.fn();
vi.mock('@/lib/arxivLookup', () => ({
  normalizeArxivId: (input: string) => mockNormalizeArxivId(input),
  fetchArxivMetadata: (id: string) => mockFetchArxivMetadata(id),
}));

const mockParseS2PaperIdFromUrl = vi.fn();
const mockFetchS2UrlMetadata = vi.fn();
vi.mock('@/lib/s2UrlLookup', () => ({
  parseS2PaperIdFromUrl: (url: string) => mockParseS2PaperIdFromUrl(url),
  fetchS2UrlMetadata: (id: string) => mockFetchS2UrlMetadata(id),
}));

describe('InboxCaptureForm', () => {
  beforeEach(() => {
    mockCreateItem.mockReset();
    mockCreateItem.mockResolvedValue({ id: 'new-item' });
    mockFetchDOIMetadata.mockReset();
    mockFetchDOIMetadata.mockResolvedValue({ title: 'DOI Paper', authors: ['A'], year: 2020, doi: '10.1/x' });
    mockParseBibtex.mockReset();
    mockNormalizeArxivId.mockReset();
    mockFetchArxivMetadata.mockReset();
    mockParseS2PaperIdFromUrl.mockReset();
    mockFetchS2UrlMetadata.mockReset();
  });

  afterEach(() => {
    dismissQuoterm();
  });

  it('captures a DOI item and calls onCreated', async () => {
    const onCreated = vi.fn();
    render(<InboxCaptureForm onCreated={onCreated} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /doi/i }));
    fireEvent.change(screen.getByPlaceholderText(/10\.\d{4,9}|doi\.org/i), { target: { value: '10.1/x' } });
    fireEvent.click(screen.getByRole('button', { name: /capture/i }));

    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'doi', sourceRef: '10.1/x' }),
    ));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('captures a manual title with no enrichment attempted', async () => {
    const onCreated = vi.fn();
    render(<InboxCaptureForm onCreated={onCreated} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /manual/i }));
    fireEvent.change(screen.getByPlaceholderText(/paper title/i), { target: { value: 'My Paper' } });
    fireEvent.click(screen.getByRole('button', { name: /capture/i }));

    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'manual', parsedFields: expect.objectContaining({ title: 'My Paper' }) }),
    ));
  });

  it('captures an arXiv item with successful enrichment', async () => {
    mockNormalizeArxivId.mockReturnValue('2301.12345');
    mockFetchArxivMetadata.mockResolvedValue({ title: 'ArXiv Paper', authors: ['B'], year: 2023, doi: '10.48550/arXiv.2301.12345' });
    const onCreated = vi.fn();
    render(<InboxCaptureForm onCreated={onCreated} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /arxiv/i }));
    fireEvent.change(screen.getByPlaceholderText(/2301\.00001/i), { target: { value: '2301.12345' } });
    fireEvent.click(screen.getByRole('button', { name: /capture/i }));

    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'arxiv', sourceRef: '2301.12345', parsedFields: expect.objectContaining({ title: 'ArXiv Paper' }) }),
    ));
    expect(onCreated).toHaveBeenCalled();
  });

  it('captures an arXiv item with { title: sourceRef } when enrichment returns null', async () => {
    mockNormalizeArxivId.mockReturnValue('2301.12345');
    mockFetchArxivMetadata.mockResolvedValue(null);
    render(<InboxCaptureForm onCreated={vi.fn()} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /arxiv/i }));
    fireEvent.change(screen.getByPlaceholderText(/2301\.00001/i), { target: { value: '2301.12345' } });
    fireEvent.click(screen.getByRole('button', { name: /capture/i }));

    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'arxiv', sourceRef: '2301.12345', parsedFields: { title: '2301.12345' } }),
    ));
  });

  it('captures a Semantic Scholar URL item with successful enrichment', async () => {
    mockParseS2PaperIdFromUrl.mockReturnValue('abc123');
    mockFetchS2UrlMetadata.mockResolvedValue({ title: 'S2 Paper', authors: ['C'], year: 2022, doi: '' });
    const onCreated = vi.fn();
    render(<InboxCaptureForm onCreated={onCreated} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /s2_url/i }));
    fireEvent.change(screen.getByPlaceholderText(/semanticscholar\.org/i), { target: { value: 'https://www.semanticscholar.org/paper/x/abc123' } });
    fireEvent.click(screen.getByRole('button', { name: /capture/i }));

    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 's2_url', parsedFields: expect.objectContaining({ title: 'S2 Paper' }) }),
    ));
    expect(onCreated).toHaveBeenCalled();
  });

  it('captures a DOI item with { title: sourceRef } when fetchDOIMetadata throws', async () => {
    mockFetchDOIMetadata.mockRejectedValue(new Error('DOI not found'));
    render(<InboxCaptureForm onCreated={vi.fn()} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /doi/i }));
    fireEvent.change(screen.getByPlaceholderText(/10\.\d{4,9}|doi\.org/i), { target: { value: '10.1/missing' } });
    fireEvent.click(screen.getByRole('button', { name: /capture/i }));

    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'doi', sourceRef: '10.1/missing', parsedFields: { title: '10.1/missing' } }),
    ));
  });

  it('captures multiple BibTeX entries in one submit, calling createItem and onCreated once per entry', async () => {
    mockParseBibtex.mockReturnValue([
      { title: 'Paper One', authors: ['X'], bibtex_key: 'one2020' },
      { title: 'Paper Two', authors: ['Y'], bibtex_key: 'two2021' },
    ]);
    const onCreated = vi.fn();
    render(<InboxCaptureForm onCreated={onCreated} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /bibtex/i }));
    fireEvent.change(screen.getByPlaceholderText(/@article/i), { target: { value: '@article{one2020,...}\n@article{two2021,...}' } });
    fireEvent.click(screen.getByRole('button', { name: /capture/i }));

    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledTimes(2));
    expect(onCreated).toHaveBeenCalledTimes(2);
    expect(mockCreateItem).toHaveBeenNthCalledWith(1, expect.objectContaining({ sourceType: 'bibtex', sourceRef: 'one2020' }));
    expect(mockCreateItem).toHaveBeenNthCalledWith(2, expect.objectContaining({ sourceType: 'bibtex', sourceRef: 'two2021' }));
  });

  it('captures a PDF URL item when a title is provided', async () => {
    const onCreated = vi.fn();
    render(<InboxCaptureForm onCreated={onCreated} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /pdf/i }));
    fireEvent.change(screen.getByPlaceholderText(/paper title/i), { target: { value: 'My PDF Paper' } });
    fireEvent.change(screen.getByPlaceholderText(/link to a hosted pdf/i), { target: { value: 'https://example.com/paper.pdf' } });
    fireEvent.click(screen.getByRole('button', { name: /capture/i }));

    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'pdf', sourceRef: 'https://example.com/paper.pdf', parsedFields: { title: 'My PDF Paper', url: 'https://example.com/paper.pdf' } }),
    ));
    expect(onCreated).toHaveBeenCalled();
  });

  it('does not call createItem for a PDF capture with an empty title', async () => {
    render(<InboxCaptureForm onCreated={vi.fn()} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /pdf/i }));
    fireEvent.change(screen.getByPlaceholderText(/link to a hosted pdf/i), { target: { value: 'https://example.com/paper.pdf' } });
    fireEvent.click(screen.getByRole('button', { name: /capture/i }));

    await waitFor(() => expect(getQuotermsSnapshot().items[0]).toMatchObject({ title: 'Title required' }));
    expect(mockCreateItem).not.toHaveBeenCalled();
  });

  it('shows an error and does not call onCreated when createItem returns null', async () => {
    mockCreateItem.mockResolvedValue(null);
    const onCreated = vi.fn();
    render(<InboxCaptureForm onCreated={onCreated} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /manual/i }));
    fireEvent.change(screen.getByPlaceholderText(/paper title/i), { target: { value: 'Some Title' } });
    fireEvent.click(screen.getByRole('button', { name: /capture/i }));

    await waitFor(() => expect(getQuotermsSnapshot().items[0]).toMatchObject({ title: 'Could not capture paper' }));
    expect(onCreated).not.toHaveBeenCalled();
  });
});
