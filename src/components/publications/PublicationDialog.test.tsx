import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardProvider } from '@/contexts/KeyboardContext';
import { Publication } from '@/types/database';
import { PublicationDialog } from './PublicationDialog';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    session: null,
  }),
}));

vi.mock('@/hooks/usePublicationRelations', () => ({
  usePublicationRelations: () => ({
    relations: [],
    loading: false,
    addRelation: vi.fn(),
    removeRelation: vi.fn(),
  }),
}));

vi.mock('@/lib/googleDrive', () => ({
  fetchGoogleDriveStatus: vi.fn(),
}));

vi.mock('@/lib/pdfUpload', () => ({
  uploadPublicationDrivePdf: vi.fn(),
  uploadVaultPublicationDrivePdf: vi.fn(),
}));

const publication: Publication = {
  id: 'pub-1',
  user_id: 'user-1',
  title: 'Saved Notes Paper',
  authors: ['Ada Lovelace'],
  year: 1843,
  journal: 'Notes Journal',
  volume: null,
  issue: null,
  pages: null,
  doi: null,
  url: null,
  abstract: null,
  pdf_url: null,
  bibtex_key: null,
  publication_type: 'article',
  notes: 'old notes',
  booktitle: null,
  chapter: null,
  edition: null,
  editor: null,
  howpublished: null,
  institution: null,
  number: null,
  organization: null,
  publisher: null,
  school: null,
  series: null,
  type: null,
  eid: null,
  isbn: null,
  issn: null,
  keywords: null,
  created_at: '2026-07-20T10:00:00.000Z',
  updated_at: '2026-07-20T10:00:00.000Z',
};

describe('PublicationDialog fullscreen notes save', () => {
  const renderDialog = (onSave: ReturnType<typeof vi.fn>) => render(
    <KeyboardProvider>
      <PublicationDialog
        open
        onOpenChange={vi.fn()}
        publication={publication}
        vaults={[]}
        tags={[]}
        publicationTags={[]}
        allPublications={[publication]}
        onSave={onSave}
        onCreateTag={vi.fn()}
      />
    </KeyboardProvider>,
  );

  it('saves the live fullscreen textarea value on Ctrl+S', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderDialog(onSave);

    fireEvent.click(screen.getByRole('button', { name: /fullscreen/i }));

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'latest notes still in the editor' } });
    fireEvent.keyDown(window, { key: 's', code: 'KeyS', ctrlKey: true });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].notes).toBe('latest notes still in the editor');
    expect(onSave.mock.calls[0][3]).toBe(true);
  });

  it('queues repeated Ctrl+S saves so the latest notes persist last', async () => {
    let finishFirstSave: () => void = () => {};
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        finishFirstSave = resolve;
      }))
      .mockResolvedValue(undefined);

    renderDialog(onSave);

    fireEvent.click(screen.getByRole('button', { name: /fullscreen/i }));

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'first save notes' } });
    fireEvent.keyDown(window, { key: 's', code: 'KeyS', ctrlKey: true });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    fireEvent.change(textarea, { target: { value: 'second save notes' } });
    fireEvent.keyDown(window, { key: 's', code: 'KeyS', ctrlKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);

    finishFirstSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[0][0].notes).toBe('first save notes');
    expect(onSave.mock.calls[1][0].notes).toBe('second save notes');
  });
});
