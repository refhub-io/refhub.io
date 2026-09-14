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

describe('InboxCaptureForm', () => {
  beforeEach(() => {
    mockCreateItem.mockReset();
    mockCreateItem.mockResolvedValue({ id: 'new-item' });
    mockFetchDOIMetadata.mockReset();
    mockFetchDOIMetadata.mockResolvedValue({ title: 'DOI Paper', authors: ['A'], year: 2020, doi: '10.1/x' });
    mockParseBibtex.mockReset();
  });

  afterEach(() => {
    dismissQuoterm();
  });

  it('only offers doi, bibtex, and manual capture tabs', () => {
    render(<InboxCaptureForm onCreated={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /doi/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /bibtex/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /manual/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /arxiv/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /s2_url/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^pdf$/i })).not.toBeInTheDocument();
  });

  it('captures a DOI item and calls onCreated', async () => {
    const onCreated = vi.fn();
    render(<InboxCaptureForm onCreated={onCreated} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /doi/i }));
    fireEvent.change(screen.getByPlaceholderText(/10\.\d{4,9}|doi\.org/i), { target: { value: '10.1/x' } });
    fireEvent.click(screen.getByRole('button', { name: /add_to_inbox/i }));

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
    fireEvent.click(screen.getByRole('button', { name: /add_to_inbox/i }));

    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'manual', parsedFields: expect.objectContaining({ title: 'My Paper' }) }),
    ));
  });

  it('captures a DOI item with { title: sourceRef } when fetchDOIMetadata throws', async () => {
    mockFetchDOIMetadata.mockRejectedValue(new Error('DOI not found'));
    render(<InboxCaptureForm onCreated={vi.fn()} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /doi/i }));
    fireEvent.change(screen.getByPlaceholderText(/10\.\d{4,9}|doi\.org/i), { target: { value: '10.1/missing' } });
    fireEvent.click(screen.getByRole('button', { name: /add_to_inbox/i }));

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
    fireEvent.click(screen.getByRole('button', { name: /add_to_inbox/i }));

    await waitFor(() => expect(mockCreateItem).toHaveBeenCalledTimes(2));
    expect(onCreated).toHaveBeenCalledTimes(2);
    expect(mockCreateItem).toHaveBeenNthCalledWith(1, expect.objectContaining({ sourceType: 'bibtex', sourceRef: 'one2020' }));
    expect(mockCreateItem).toHaveBeenNthCalledWith(2, expect.objectContaining({ sourceType: 'bibtex', sourceRef: 'two2021' }));
  });

  it('does not call createItem for a manual capture with an empty title', async () => {
    render(<InboxCaptureForm onCreated={vi.fn()} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /manual/i }));
    fireEvent.click(screen.getByRole('button', { name: /add_to_inbox/i }));

    await waitFor(() => expect(getQuotermsSnapshot().items[0]).toMatchObject({ title: 'Title required' }));
    expect(mockCreateItem).not.toHaveBeenCalled();
  });

  it('shows an error and does not call onCreated when createItem returns null', async () => {
    mockCreateItem.mockResolvedValue(null);
    const onCreated = vi.fn();
    render(<InboxCaptureForm onCreated={onCreated} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /manual/i }));
    fireEvent.change(screen.getByPlaceholderText(/paper title/i), { target: { value: 'Some Title' } });
    fireEvent.click(screen.getByRole('button', { name: /add_to_inbox/i }));

    await waitFor(() => expect(getQuotermsSnapshot().items[0]).toMatchObject({ title: 'Could not add paper' }));
    expect(onCreated).not.toHaveBeenCalled();
  });
});
