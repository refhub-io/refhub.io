import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InboxCaptureForm } from './InboxCaptureForm';

const mockCreateItem = vi.fn();
vi.mock('@/hooks/useInbox', () => ({ useInbox: () => ({ createItem: mockCreateItem }) }));

vi.mock('@/lib/bibtex', () => ({
  fetchDOIMetadata: vi.fn().mockResolvedValue({ title: 'DOI Paper', authors: ['A'], year: 2020, doi: '10.1/x' }),
  parseBibtex: vi.fn(),
  generateBibtexKey: vi.fn().mockReturnValue('key2020'),
}));

describe('InboxCaptureForm', () => {
  beforeEach(() => { mockCreateItem.mockReset(); mockCreateItem.mockResolvedValue({ id: 'new-item' }); });

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
});
