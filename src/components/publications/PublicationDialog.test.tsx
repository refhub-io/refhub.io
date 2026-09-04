import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardProvider } from '@/contexts/KeyboardContext';
import { Publication } from '@/types/database';
import type { RelationshipSuggestion } from '@/lib/relationshipSuggestions';
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

const mockFetchCitationGraph = vi.fn();
const mockFindRelationshipSuggestions = vi.fn();

vi.mock('@/lib/relationshipSuggestions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relationshipSuggestions')>();
  return {
    ...actual,
    fetchCitationGraph: (...args: unknown[]) => mockFetchCitationGraph(...args),
    findRelationshipSuggestions: (...args: unknown[]) => mockFindRelationshipSuggestions(...args),
  };
});

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

const existingPublicationWithSuggestions: Publication = {
  ...publication,
  id: 'pub-2',
  title: 'Existing Paper With Suggestions',
  doi: '10.1/existing-paper',
};

// Minimal prop set required to render the dialog, following the house
// pattern (see `renderDialog` above) of stubbing everything with vi.fn()
// and wrapping in KeyboardProvider since the component reads keyboard
// context via useHotkeys/KbdHint.
const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  publication,
  vaults: [],
  tags: [],
  publicationTags: [],
  allPublications: [publication],
  onSave: vi.fn().mockResolvedValue(undefined),
  onCreateTag: vi.fn(),
};

const renderDialogWithProps = (overrides: Record<string, unknown> = {}) => render(
  <KeyboardProvider>
    <PublicationDialog {...(baseProps as any)} {...overrides} />
  </KeyboardProvider>,
);

describe('PublicationDialog auto-trigger (new publication, DOI entered)', () => {
  beforeEach(() => {
    mockFetchCitationGraph.mockReset();
    mockFetchCitationGraph.mockResolvedValue({ references: [], citations: [] });
  });

  it('starts fetchCitationGraph as soon as a DOI is entered for a new (unsaved) publication', async () => {
    // publication={null} models "add new paper" — no id exists yet.
    renderDialogWithProps({ publication: null });

    fireEvent.change(screen.getByLabelText(/doi/i), { target: { value: '10.1/new-paper' } });

    await waitFor(() => expect(mockFetchCitationGraph).toHaveBeenCalledWith('10.1/new-paper'));
  });

  it('does not call fetchCitationGraph again for the same DOI on every keystroke/re-render', async () => {
    renderDialogWithProps({ publication: null });
    fireEvent.change(screen.getByLabelText(/doi/i), { target: { value: '10.1/new-paper' } });
    await waitFor(() => expect(mockFetchCitationGraph).toHaveBeenCalledTimes(1));

    fireEvent.blur(screen.getByLabelText(/doi/i));
    expect(mockFetchCitationGraph).toHaveBeenCalledTimes(1);
  });
});

describe('PublicationDialog pending-suggestions close guard', () => {
  const mockSuggestion: RelationshipSuggestion = {
    sourcePublicationId: existingPublicationWithSuggestions.id,
    sourceTitle: existingPublicationWithSuggestions.title,
    targetPublicationId: 'pub-3',
    targetTitle: 'Cited Paper',
    discoveredVia: 'references',
  };

  beforeEach(() => {
    mockFindRelationshipSuggestions.mockReset();
    mockFindRelationshipSuggestions.mockResolvedValue([mockSuggestion]);
  });

  const openWithSuggestions = async (onOpenChange: ReturnType<typeof vi.fn>) => {
    renderDialogWithProps({
      onOpenChange,
      publication: existingPublicationWithSuggestions,
      allPublications: [existingPublicationWithSuggestions],
    });

    fireEvent.click(screen.getByRole('button', { name: 'check_relationships' }));
    await screen.findByRole('button', { name: 'approve' });
  };

  it('shows a pending-suggestions dialog instead of closing when there are unreviewed suggestions', async () => {
    const onOpenChange = vi.fn();
    await openWithSuggestions(onOpenChange);

    fireEvent.click(screen.getByRole('button', { name: 'close' }));

    // UnsavedChangesDialog renders its title as "// <title, snake_cased>" (see
    // src/components/ui/unsaved-changes-dialog.tsx) — the words are
    // underscore-joined, not space-separated, so the matcher looks for that form.
    expect(await screen.findByText(/pending_relationship_suggestions/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('discarding the pending-suggestions dialog clears suggestions and closes', async () => {
    const onOpenChange = vi.fn();
    await openWithSuggestions(onOpenChange);

    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(await screen.findByRole('button', { name: /discard/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

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
