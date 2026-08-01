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
    const preview = document.body.querySelector('table');
    expect(preview?.textContent).toContain('A Paper');
  });

  it('lets the preview table scroll horizontally instead of clipping columns', () => {
    render(<ExportDialog open onOpenChange={() => {}} publications={[pub as never]} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /csv/i }));

    const table = document.body.querySelector('table');
    // Regression: the table previously had `w-full`, which let the browser
    // satisfy that width by shrinking/ellipsis-truncating columns instead of
    // ever overflowing its container -- so extra columns were unreachable,
    // with no scrollbar. It must size to its natural content width instead.
    expect(table?.className).not.toMatch(/(^|\s)w-full(\s|$)/);

    // Its scroll container must allow horizontal overflow (not just vertical,
    // which is all <ScrollArea>'s default scrollbar provides).
    const scrollContainer = table?.parentElement;
    expect(scrollContainer?.className).toMatch(/overflow-(auto|x-auto)/);
  });

  it('lets the user deselect a CSV field, removing it from the preview and download', () => {
    render(<ExportDialog open onOpenChange={() => {}} publications={[pub as never]} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /csv/i }));

    // All fields start checked; uncheck "notes". "notes" also appears as a table
    // header once the preview renders, so disambiguate by picking the match
    // that's inside a checkbox <label>, not a <th>.
    const notesLabel = screen.getAllByText('notes').map(el => el.closest('label')).find((el): el is HTMLLabelElement => !!el)!;
    const notesCheckbox = notesLabel.querySelector('button[role="checkbox"]')!;
    fireEvent.click(notesCheckbox);

    const headerCells = Array.from(document.body.querySelectorAll('table thead th')).map(th => th.textContent);
    expect(headerCells).not.toContain('notes');

    fireEvent.click(screen.getByRole('button', { name: /export_\.csv/i }));
    const [content] = mockedDownloadTextFile.mock.calls[0];
    expect(content.split('\r\n')[0]).not.toContain('notes');
  });

  it('truncates the preview table to a handful of rows and says how many were left out', () => {
    const pubs = Array.from({ length: 7 }, (_, i) => ({ ...pub, id: `pub-${i}`, title: `Paper ${i}` }));
    render(<ExportDialog open onOpenChange={() => {}} publications={pubs as never[]} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /csv/i }));

    expect(document.body.querySelectorAll('table tbody tr').length).toBe(5);
    expect(screen.getByText('// 5 of 7 rows')).toBeInTheDocument();
    // The full file (not just the preview) still contains every row.
    fireEvent.click(screen.getByRole('button', { name: /export_\.csv/i }));
    const [content] = mockedDownloadTextFile.mock.calls[0];
    expect(content.split('\r\n').length).toBe(8); // 1 header row + 7 publication rows
  });

  it('disables copy/export and shows a warning when no CSV fields are selected', () => {
    render(<ExportDialog open onOpenChange={() => {}} publications={[pub as never]} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /^none$/i }));

    expect(screen.getByText(/please select at least one field/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export_\.csv/i })).toBeDisabled();
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
    const preview = document.body.querySelector('table');
    expect(preview?.textContent?.includes('\uFEFF')).toBe(false);
  });
});
