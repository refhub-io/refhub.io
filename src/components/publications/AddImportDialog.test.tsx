import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Vault } from '@/types/database';
import type { RelationshipSuggestion } from '@/lib/relationshipSuggestions';
import { AddImportDialog } from './AddImportDialog';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'user@example.com' }, session: null }),
}));

vi.mock('@/lib/bibtex', () => ({
  fetchDOIMetadata: vi.fn().mockResolvedValue({
    title: 'Resolved Paper',
    authors: ['Author One'],
    year: 2021,
    journal: 'Journal X',
    volume: '1',
    issue: '1',
    pages: '1-10',
    doi: '10.1/resolved',
    url: '',
    abstract: '',
    type: 'article',
  }),
  parseBibtex: vi.fn().mockReturnValue([]),
  generateBibtexKey: vi.fn().mockReturnValue('resolved2021'),
}));

const mockFindRelationshipSuggestions = vi.fn();
vi.mock('@/lib/relationshipSuggestions', () => ({
  findRelationshipSuggestions: (...args: unknown[]) => mockFindRelationshipSuggestions(...args),
}));

const mockInsert = vi.fn();

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

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'vault_publications') {
        return makeQueryBuilder((calls) => {
          if (calls.some((c) => c.method === 'eq' && c.args[0] === 'original_publication_id')) {
            return { data: { id: 'new-copy-id' }, error: null };
          }
          return {
            data: [
              { id: 'new-copy-id', title: 'Resolved Paper', doi: '10.1/resolved', created_by: 'user-1', authors: [] },
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
  sourceTitle: 'Resolved Paper',
  targetPublicationId: 'other-pub-id',
  targetTitle: 'Other Paper In Vault',
  discoveredVia: 'references',
};

const renderDialog = (onImport = vi.fn().mockResolvedValue(['canonical-pub-id'])) => {
  const onOpenChange = vi.fn();
  render(
    <AddImportDialog
      open
      onOpenChange={onOpenChange}
      vaults={[mockVault]}
      allPublications={[]}
      currentVaultId="vault-1"
      onImport={onImport}
    />,
  );
  return { onOpenChange, onImport };
};

const lookupAndImportOneDoiPaper = async () => {
  fireEvent.mouseDown(screen.getByRole('tab', { name: /doi/i }));
  fireEvent.change(screen.getByPlaceholderText(/10\.\d{4,9}|doi\.org/i), { target: { value: '10.1/resolved' } });
  fireEvent.click(screen.getByRole('button', { name: /^lookup$/i }));
  await screen.findByText('Resolved Paper');
  fireEvent.click(screen.getByRole('button', { name: /import_1_paper/i }));
};

describe('AddImportDialog — relationship check after single-paper DOI import (entry point 2)', () => {
  beforeEach(() => {
    mockFindRelationshipSuggestions.mockReset();
    mockInsert.mockReset();
    mockInsert.mockResolvedValue({ data: null, error: null });
  });

  it('checks for relationships after importing exactly one DOI-bearing paper into a vault', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([mockSuggestion]);
    const { onOpenChange } = renderDialog();

    await lookupAndImportOneDoiPaper();

    expect(await screen.findByText(/checking "Target Vault" for citation relationships/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Other Paper In Vault')).toBeInTheDocument());
    expect(mockFindRelationshipSuggestions).toHaveBeenCalledWith(
      { id: 'new-copy-id', doi: '10.1/resolved', title: 'Resolved Paper' },
      expect.any(Array),
      [],
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes immediately without checking when more than one paper is imported at once (never for a batch)', async () => {
    mockFindRelationshipSuggestions.mockResolvedValue([mockSuggestion]);
    const onImport = vi.fn().mockResolvedValue(['pub-a', 'pub-b']);
    const { onOpenChange } = renderDialog(onImport);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /doi/i }));
    fireEvent.change(screen.getByPlaceholderText(/10\.\d{4,9}|doi\.org/i), { target: { value: '10.1/resolved' } });
    fireEvent.click(screen.getByRole('button', { name: /^lookup$/i }));
    await screen.findByText('Resolved Paper');
    // Force a two-paper batch by re-resolving the same DOI a second time —
    // the preview list doesn't dedupe, so this queues a second entry.
    fireEvent.change(screen.getByPlaceholderText(/10\.\d{4,9}|doi\.org/i), { target: { value: '10.1/resolved' } });
    fireEvent.click(screen.getByRole('button', { name: /^lookup$/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /import_2_papers/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /import_2_papers/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mockFindRelationshipSuggestions).not.toHaveBeenCalled();
  });
});
