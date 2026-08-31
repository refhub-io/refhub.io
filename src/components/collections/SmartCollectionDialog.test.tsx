import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SmartCollectionDialog } from './SmartCollectionDialog';
import type { Publication, SmartCollection } from '@/types/database';

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 'p1', user_id: 'u1', title: 'Untitled', authors: [], year: 2020,
    journal: null, volume: null, issue: null, pages: null, doi: null, url: null,
    abstract: null, pdf_url: null, bibtex_key: null, publication_type: 'article',
    notes: null, booktitle: null, chapter: null, edition: null, editor: null,
    howpublished: null, institution: null, number: null, organization: null,
    publisher: null, school: null, series: null, type: null, eid: null,
    isbn: null, issn: null, keywords: null, reading_state: 'unread', important: false,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('SmartCollectionDialog', () => {
  it('shows a live match count reflecting all publications when no rules are set', () => {
    render(
      <SmartCollectionDialog
        open
        onOpenChange={() => {}}
        editingCollection={null}
        allPublications={[makePub({ id: 'a' }), makePub({ id: 'b' })]}
        tags={[]}
        vaults={[]}
        publicationTagsMap={{}}
        publicationVaultsMap={{}}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(/2_matching_papers/i)).toBeInTheDocument();
  });

  it('requires a name before the submit button is enabled', () => {
    render(
      <SmartCollectionDialog
        open
        onOpenChange={() => {}}
        editingCollection={null}
        allPublications={[]}
        tags={[]}
        vaults={[]}
        publicationTagsMap={{}}
        publicationVaultsMap={{}}
        onSave={vi.fn()}
      />,
    );
    // A new (not-yet-editing) collection's submit button reads "create_collection",
    // matching VaultDialog's create_vault/save_changes distinction.
    expect(screen.getByRole('button', { name: /create_collection/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Reading list' } });
    expect(screen.getByRole('button', { name: /create_collection/i })).not.toBeDisabled();
  });

  it('prefills and saves the description alongside the name', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editingCollection: SmartCollection = {
      id: 'c1', user_id: 'u1', name: 'Unread guidance', description: 'papers to read before the survey',
      color: '#a855f7', filters: [], created_at: 't', updated_at: 't',
    };
    render(
      <SmartCollectionDialog
        open
        onOpenChange={() => {}}
        editingCollection={editingCollection}
        allPublications={[]}
        tags={[]}
        vaults={[]}
        publicationTagsMap={{}}
        publicationVaultsMap={{}}
        onSave={onSave}
      />,
    );
    const descriptionField = screen.getByLabelText(/description/i);
    expect(descriptionField).toHaveValue('papers to read before the survey');

    fireEvent.change(descriptionField, { target: { value: 'updated intent' } });
    fireEvent.click(screen.getByRole('button', { name: /save_changes/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Unread guidance', description: 'updated intent' }),
    );
  });
});
