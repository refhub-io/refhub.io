import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportDialog } from './ExportDialog';
import { downloadTextFile } from '@/lib/export';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/KeyboardContext', () => ({
  useKeyboardContext: () => ({ saveFocus: vi.fn(), pushContext: vi.fn(), popContext: vi.fn(), restoreFocus: vi.fn() }),
}));
// Only the download side effect is stubbed; formatCSV et al. stay real so the
// preview assertions below still exercise the actual CSV serializer.
vi.mock('@/lib/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/export')>();
  return { ...actual, downloadTextFile: vi.fn() };
});

const mockedDownloadTextFile = vi.mocked(downloadTextFile);

const pub = {
  id: 'pub-1', user_id: 'u1', title: 'A Paper', authors: ['Ada'], year: 2024,
  journal: 'J', volume: null, issue: null, pages: null, doi: null, url: null,
  abstract: null, pdf_url: null, bibtex_key: null, publication_type: 'article', notes: null,
  booktitle: null, chapter: null, edition: null, editor: null, howpublished: null,
  institution: null, number: null, organization: null, publisher: null, school: null,
  series: null, type: null, eid: null,
};

describe('ExportDialog CSV tab', () => {
  beforeEach(() => {
    mockedDownloadTextFile.mockClear();
  });

  it('shows a CSV tab and lets the user switch to it', () => {
    render(<ExportDialog open onOpenChange={() => {}} publications={[pub as never]} />);
    const csvTab = screen.getByRole('tab', { name: /csv/i });
    fireEvent.mouseDown(csvTab);
    // Dialog content is portaled to document.body, so query there directly.
    const preview = document.body.querySelector('pre');
    expect(preview?.textContent).toContain('refhub_id');
    expect(preview?.textContent).toContain('A Paper');
  });

  it('downloads the CSV with a UTF-8 BOM so Excel renders diacritics correctly', () => {
    const diacriticPub = { ...pub, id: 'pub-2', authors: ['Müller, Zaïdi, Łukasiewicz'] };
    render(
      <ExportDialog
        open
        onOpenChange={() => {}}
        publications={[diacriticPub as never]}
        vaultName="My Vault"
      />
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: /csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /export_\.csv/i }));

    expect(mockedDownloadTextFile).toHaveBeenCalledTimes(1);
    const [content, filename, mimeType] = mockedDownloadTextFile.mock.calls[0];
    expect(content.startsWith('\uFEFF')).toBe(true);
    // The BOM is a prefix only -- the payload itself is untouched CSV.
    expect(content.slice(1).startsWith('title,authors,')).toBe(true);
    expect(content).toContain('Müller, Zaïdi, Łukasiewicz');
    expect(filename).toBe('my-vault.csv');
    expect(mimeType).toBe('text/csv;charset=utf-8');
  });

  it('does not put a BOM in the on-screen CSV preview', () => {
    render(<ExportDialog open onOpenChange={() => {}} publications={[pub as never]} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /csv/i }));
    const preview = document.body.querySelector('pre');
    expect(preview?.textContent?.startsWith('\uFEFF')).toBe(false);
  });
});
