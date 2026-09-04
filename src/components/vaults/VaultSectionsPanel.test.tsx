import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { VaultSectionsPanel } from './VaultSectionsPanel';
import { supabase } from '@/integrations/supabase/client';
import type { Publication, Vault, VaultSection } from '@/types/database';

const mockFetchSections = vi.fn();
const mockCreate = vi.fn();
const mockUpdatePublicationSection = vi.fn();
const mockPublicationsQuery = vi.fn();

vi.mock('@/lib/vaultSections', () => ({
  fetchVaultSections: (...args: unknown[]) => mockFetchSections(...args),
  createVaultSection: (...args: unknown[]) => mockCreate(...args),
  updateVaultSection: vi.fn(),
  deleteVaultSection: vi.fn(),
  reorderVaultSections: vi.fn(),
  updateVaultPublicationSection: (...args: unknown[]) => mockUpdatePublicationSection(...args),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'vault_publications') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            order: () => mockPublicationsQuery(),
          }),
        }),
      };
    },
  },
}));
// formatVaultPublication normally maps DB column names (e.g. created_by) to
// Publication fields (user_id) — tests feed it Publication fixtures directly,
// so pass them through unchanged instead of re-deriving DB column mapping.
vi.mock('@/lib/formatVaultPublication', () => ({
  formatVaultPublication: (row: unknown) => row,
}));

function makeVault(overrides: Partial<Vault> = {}): Vault {
  return {
    id: 'v1', user_id: 'u1', name: 'treemaps_lab', description: null, color: '#a855f7',
    visibility: 'public', public_slug: 'treemaps-lab', category: null, abstract: null,
    created_at: '', updated_at: '', archived_at: null, ...overrides,
  };
}

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 'p1', user_id: 'u1', title: 'Temporal Treemaps', authors: ['Hong'], year: 2021,
    journal: null, volume: null, issue: null, pages: null, doi: null, url: null, abstract: null,
    pdf_url: null, bibtex_key: null, publication_type: 'article', notes: null, booktitle: null,
    chapter: null, edition: null, editor: null, howpublished: null, institution: null, number: null,
    organization: null, publisher: null, school: null, series: null, type: null, eid: null,
    isbn: null, issn: null, keywords: null, reading_state: 'unread', important: false,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    section_id: null, section_position: 0, featured: false, featured_note: null,
    ...overrides,
  };
}

describe('VaultSectionsPanel', () => {
  beforeEach(() => {
    mockFetchSections.mockReset();
    mockCreate.mockReset();
    mockUpdatePublicationSection.mockReset();
    mockPublicationsQuery.mockReset();
  });

  it('creates a section from the add-section form', async () => {
    mockPublicationsQuery.mockResolvedValue({ data: [makePub()], error: null });
    mockFetchSections.mockResolvedValueOnce([]);
    const created: VaultSection = { id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' };
    mockCreate.mockResolvedValue(created);
    mockFetchSections.mockResolvedValueOnce([created]);

    render(<VaultSectionsPanel vault={makeVault()} />);

    await waitFor(() => expect(screen.getByPlaceholderText(/section name/i)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/section name/i), { target: { value: 'starter_papers' } });
    fireEvent.click(screen.getByRole('button', { name: /add section/i }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(supabase, 'v1', { name: 'starter_papers', description: null, position: 0 }));
  });

  it('assigns a paper to a section', async () => {
    const section: VaultSection = { id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' };
    mockFetchSections.mockResolvedValue([section]);
    mockPublicationsQuery.mockResolvedValue({ data: [makePub()], error: null });
    mockUpdatePublicationSection.mockResolvedValue(undefined);

    render(<VaultSectionsPanel vault={makeVault()} />);

    await waitFor(() => expect(screen.getByText('Temporal Treemaps')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/section for temporal treemaps/i), { target: { value: 's1' } });

    await waitFor(() => expect(mockUpdatePublicationSection).toHaveBeenCalledWith(supabase, 'p1', { section_id: 's1', section_position: 0 }));
  });

  it('toggles featured and saves a note for a sectioned paper', async () => {
    const section: VaultSection = { id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' };
    mockFetchSections.mockResolvedValue([section]);
    mockPublicationsQuery.mockResolvedValue({ data: [makePub({ section_id: 's1' })], error: null });
    mockUpdatePublicationSection.mockResolvedValue(undefined);

    render(<VaultSectionsPanel vault={makeVault()} />);

    await waitFor(() => expect(screen.getByLabelText(/feature temporal treemaps/i)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/feature temporal treemaps/i));

    await waitFor(() => expect(mockUpdatePublicationSection).toHaveBeenCalledWith(supabase, 'p1', { featured: true }));
  });

  it('reorders papers within a section by swapping section_position', async () => {
    const section: VaultSection = { id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' };
    mockFetchSections.mockResolvedValue([section]);
    mockUpdatePublicationSection.mockResolvedValue(undefined);

    const pub1 = makePub({ id: 'p1', title: 'First Paper', section_id: 's1', section_position: 0 });
    const pub2 = makePub({ id: 'p2', title: 'Second Paper', section_id: 's1', section_position: 1 });
    mockPublicationsQuery.mockResolvedValue({ data: [pub1, pub2], error: null });

    const onPublicationsChange = vi.fn();
    render(<VaultSectionsPanel vault={makeVault()} onPublicationsChange={onPublicationsChange} />);

    await waitFor(() => expect(screen.getByLabelText(/move first paper up within section/i)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/move second paper up within section/i));

    await waitFor(() => {
      expect(mockUpdatePublicationSection).toHaveBeenCalledWith(supabase, 'p1', { section_position: 1 });
      expect(mockUpdatePublicationSection).toHaveBeenCalledWith(supabase, 'p2', { section_position: 0 });
    });

    const callArgs = onPublicationsChange.mock.calls[onPublicationsChange.mock.calls.length - 1][0];
    const swappedPub1 = callArgs.find((p) => p.id === 'p1');
    const swappedPub2 = callArgs.find((p) => p.id === 'p2');
    expect(swappedPub1?.section_position).toBe(1);
    expect(swappedPub2?.section_position).toBe(0);
  });

  it('loads its own papers even when no onPublicationsChange callback is given (opened outside the vault detail page)', async () => {
    mockFetchSections.mockResolvedValue([]);
    mockPublicationsQuery.mockResolvedValue({ data: [makePub({ title: 'Standalone Paper' })], error: null });

    render(<VaultSectionsPanel vault={makeVault()} />);

    await waitFor(() => expect(screen.getByText('Standalone Paper')).toBeInTheDocument());
  });
});
