import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportDialog } from './ExportDialog';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/KeyboardContext', () => ({
  useKeyboardContext: () => ({ saveFocus: vi.fn(), pushContext: vi.fn(), popContext: vi.fn(), restoreFocus: vi.fn() }),
}));

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
    // downloadTextFile touches the DOM (anchor + Blob); jsdom supports this without mocking.
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
});
