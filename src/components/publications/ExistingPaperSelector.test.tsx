import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Publication, Vault } from '@/types/database';
import type { RelationshipSuggestion } from '@/lib/relationshipSuggestions';
import { ExistingPaperSelector } from './ExistingPaperSelector';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'user@example.com' }, session: null }),
}));

const mockFindRelationshipSuggestions = vi.fn();
vi.mock('@/lib/relationshipSuggestions', () => ({
  findRelationshipSuggestions: (...args: unknown[]) => mockFindRelationshipSuggestions(...args),
}));

function makeQueryBuilder(resolve: (calls: { method: string; args: unknown[] }[]) => { data: unknown; error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'or']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(resolve(calls)));
  builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(resolve(calls)).then(onFulfilled, onRejected);
  return builder;
}

const mockInsert = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'vault_publications') {
        return makeQueryBuilder((calls) => {
          if (calls.some((c) => c.method === 'in')) {
            // Mount-time "which vaults already have this paper" loader.
            return { data: [], error: null };
          }
          if (calls.some((c) => c.method === 'eq' && c.args[0] === 'original_publication_id')) {
            // Resolving the newly-created vault_publications copy's id.
            return { data: { id: 'new-copy-id' }, error: null };
          }
          // Fetching the target vault's full publication list (scan, and
          // the post-add copy-id resolution's own eventual re-fetch).
          return {
            data: [
              { id: 'existing-copy-id', title: 'Selected Paper', doi: '10.1/selected', created_by: 'user-1', authors: [] },
              { id: 'other-pub-id', title: 'Other Paper In Vault', doi: '10.1/other', created_by: 'user-1', authors: [] },
            ],
            error: null,
          };
        });
      }
      if (table === 'publication_relations') {
        return { insert: (...args: unknown[]) => mockInsert(...args) };
      }
      return makeQueryBuilder(() => ({ data: [], error: null }));
    },
  },
}));

const basePublication: Publication = {
  id: 'lib-pub-1',
  user_id: 'user-1',
  title: 'Selected Paper',
  authors: ['Author One'],
  year: 2020,
  journal: null,
  volume: null,
  issue: null,
  pages: null,
  doi: '10.1/selected',
  url: null,
  abstract: null,
  pdf_url: null,
  bibtex_key: null,
  publication_type: 'article',
  notes: null,
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
  reading_state: 'unread',
  important: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const mockVault: Vault = {
  id: 'vault-1',
  user_id: 'user-1',
  name: 'Target Vault',
  description: '',
  color: '#a855f7',
  category: 'research',
  abstract: '',
  visibility: 'private',
  public_slug: null,
  archived_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const mockSuggestion: RelationshipSuggestion = {
  sourcePublicationId: 'lib-pub-1',
  sourceTitle: 'Selected Paper',
  targetPublicationId: 'other-pub-id',
  targetTitle: 'Other Paper In Vault',
  discoveredVia: 'references',
};

const renderSelector = (overrides: Partial<Publication> = {}, onAddToVaults = vi.fn().mockResolvedValue(undefined), onDone = vi.fn()) => {
  const publication = { ...basePublication, ...overrides };
  const { rerender } = render(
    <ExistingPaperSelector
      publications={[publication]}
      vaults={[mockVault]}
      currentVaultId={null}
      onAddToVaults={onAddToVaults}
      onDone={onDone}
      open
    />,
  );
  const setOpen = (open: boolean) => rerender(
    <ExistingPaperSelector
      publications={[publication]}
      vaults={[mockVault]}
      currentVaultId={null}
      onAddToVaults={onAddToVaults}
      onDone={onDone}
      open={open}
    />,
  );
  return { onAddToVaults, onDone, publication, setOpen };
};

const selectPaperAndVault = async () => {
  fireEvent.click(await screen.findByText('Selected Paper'));
  fireEvent.click(await screen.findByText('Target Vault'));
};

describe('ExistingPaperSelector — pre-add relationship scan (ephemeral, single vault)', () => {
  beforeEach(() => {
    mockFindRelationshipSuggestions.mockReset();
    mockInsert.mockReset();
    mockInsert.mockResolvedValue({ data: null, error: null });
  });

  it('shows a scan button once a DOI-bearing paper and exactly one vault are selected', async () => {
    renderSelector();
    await selectPaperAndVault();

    expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument();
  });

  it('scanning finds suggestions; approving stages them without writing to the DB yet', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([mockSuggestion]);
    renderSelector();
    await selectPaperAndVault();

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await screen.findByText('Other Paper In Vault');
    expect(mockFindRelationshipSuggestions).toHaveBeenCalledWith(
      { id: 'lib-pub-1', doi: '10.1/selected', title: 'Selected Paper' },
      expect.any(Array),
      [],
    );

    fireEvent.click(screen.getByRole('button', { name: 'approve' }));

    expect(mockInsert).not.toHaveBeenCalled();
    expect(await screen.findByText(/1 staged/i)).toBeInTheDocument();
  });

  it('committing a staged suggestion on add reconciles the placeholder id to the real vault copy id', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([mockSuggestion]);
    const { onDone } = renderSelector();
    await selectPaperAndVault();

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await screen.findByText('Other Paper In Vault');
    fireEvent.click(screen.getByRole('button', { name: 'approve' }));

    fireEvent.click(screen.getByRole('button', { name: /add_to_1_vault/i }));

    await waitFor(() => expect(mockInsert).toHaveBeenCalledWith([
      {
        publication_id: 'new-copy-id',
        related_publication_id: 'other-pub-id',
        relation_type: 'cites',
        created_by: 'user-1',
      },
    ]));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('dismissing a suggestion never stages or commits it', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([mockSuggestion]);
    renderSelector();
    await selectPaperAndVault();

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await screen.findByText('Other Paper In Vault');
    fireEvent.click(screen.getByRole('button', { name: 'dismiss' }));

    expect(screen.queryByText('Other Paper In Vault')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add_to_1_vault/i }));
    await waitFor(() => expect(mockInsert).not.toHaveBeenCalled());
  });

  it('does not offer a scan when the selected paper has no DOI', async () => {
    renderSelector({ doi: null });
    await selectPaperAndVault();

    expect(screen.queryByRole('button', { name: /^scan$/i })).not.toBeInTheDocument();
  });

  it('resets scan/staged state when the host dialog closes via a non-add path (X/Escape/outside-click)', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([mockSuggestion]);
    const { setOpen } = renderSelector();
    await selectPaperAndVault();
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await screen.findByText('Other Paper In Vault');
    fireEvent.click(screen.getByRole('button', { name: 'approve' }));

    // Simulate the host dialog closing through a path that skips "add"
    // entirely (X button, Escape, outside click all just flip `open`).
    // The paper/vault selection itself is a separate concern and correctly
    // survives this — only the ephemeral scan state should clear.
    setOpen(false);
    setOpen(true);

    expect(screen.queryByText(/staged/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Other Paper In Vault')).not.toBeInTheDocument();
  });

  it('shows the search UI again after a successful add, not stale scan state', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([mockSuggestion]);
    const { onDone } = renderSelector();
    await selectPaperAndVault();
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await screen.findByText('Other Paper In Vault');
    fireEvent.click(screen.getByRole('button', { name: 'approve' }));

    fireEvent.click(screen.getByRole('button', { name: /add_to_1_vault/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    expect(screen.getByText(/search your papers/i)).toBeInTheDocument();
    expect(screen.queryByText('Other Paper In Vault')).not.toBeInTheDocument();
  });
});
