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
          // Fetching the target vault's full publication list.
          return {
            data: [
              { id: 'new-copy-id', title: 'Selected Paper', doi: '10.1/selected', created_by: 'user-1', authors: [] },
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
  sourcePublicationId: 'new-copy-id',
  sourceTitle: 'Selected Paper',
  targetPublicationId: 'other-pub-id',
  targetTitle: 'Other Paper In Vault',
  discoveredVia: 'references',
};

const renderSelector = (overrides: Partial<Publication> = {}, onAddToVaults = vi.fn().mockResolvedValue(undefined), onDone = vi.fn()) => {
  const publication = { ...basePublication, ...overrides };
  render(
    <ExistingPaperSelector
      publications={[publication]}
      vaults={[mockVault]}
      currentVaultId={null}
      onAddToVaults={onAddToVaults}
      onDone={onDone}
    />,
  );
  return { onAddToVaults, onDone, publication };
};

const selectPaperAndVault = async () => {
  fireEvent.click(await screen.findByText('Selected Paper'));
  fireEvent.click(await screen.findByText('Target Vault'));
};

describe('ExistingPaperSelector — relationship check after add (entry point 2)', () => {
  beforeEach(() => {
    mockFindRelationshipSuggestions.mockReset();
    mockInsert.mockReset();
    mockInsert.mockResolvedValue({ data: null, error: null });
  });

  it('checks for relationships and shows a suggestion after adding a DOI-bearing paper', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([mockSuggestion]);
    const { onDone } = renderSelector();

    await selectPaperAndVault();
    fireEvent.click(screen.getByRole('button', { name: /add_to_1_vault/i }));

    expect(await screen.findByText(/checking "Target Vault" for citation relationships/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Other Paper In Vault')).toBeInTheDocument();
    });
    expect(mockFindRelationshipSuggestions).toHaveBeenCalledWith(
      { id: 'new-copy-id', doi: '10.1/selected', title: 'Selected Paper' },
      expect.any(Array),
      [],
    );
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone).toHaveBeenCalled();
  });

  it('approving a suggestion inserts a cites relation and removes it from the list', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([mockSuggestion]);
    renderSelector();

    await selectPaperAndVault();
    fireEvent.click(screen.getByRole('button', { name: /add_to_1_vault/i }));
    await waitFor(() => expect(screen.getByText('Other Paper In Vault')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith({
        publication_id: 'new-copy-id',
        related_publication_id: 'other-pub-id',
        relation_type: 'cites',
        created_by: 'user-1',
      });
    });
    await waitFor(() => {
      expect(screen.queryByText('Other Paper In Vault')).not.toBeInTheDocument();
    });
  });

  it('shows a "no relationships found" message when the check finds nothing', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([]);
    renderSelector();

    await selectPaperAndVault();
    fireEvent.click(screen.getByRole('button', { name: /add_to_1_vault/i }));

    expect(await screen.findByText(/no citation relationships found/i)).toBeInTheDocument();
  });

  it('closes immediately without checking when the added paper has no DOI', async () => {
    const { onDone } = renderSelector({ doi: null });

    await selectPaperAndVault();
    fireEvent.click(screen.getByRole('button', { name: /add_to_1_vault/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockFindRelationshipSuggestions).not.toHaveBeenCalled();
    expect(screen.queryByText(/checking/i)).not.toBeInTheDocument();
  });

  it('shows the search UI again after "done" is clicked, not the stale review screen — the host dialog keeps this component mounted across opens rather than remounting it', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([mockSuggestion]);
    renderSelector();

    await selectPaperAndVault();
    fireEvent.click(screen.getByRole('button', { name: /add_to_1_vault/i }));
    await waitFor(() => expect(screen.getByText('Other Paper In Vault')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /done/i }));

    expect(screen.getByText(/search your papers/i)).toBeInTheDocument();
    expect(screen.queryByText(/checking "Target Vault"/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Other Paper In Vault')).not.toBeInTheDocument();
  });
});
