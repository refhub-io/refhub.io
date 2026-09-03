import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { VaultSectionsPanel } from './VaultSectionsPanel';
import type { Publication, VaultSection } from '@/types/database';

const mockFetch = vi.fn();
const mockCreate = vi.fn();
const mockUpdatePublicationSection = vi.fn();

vi.mock('@/lib/vaultSections', () => ({
  fetchVaultSections: (...args: unknown[]) => mockFetch(...args),
  createVaultSection: (...args: unknown[]) => mockCreate(...args),
  updateVaultSection: vi.fn(),
  deleteVaultSection: vi.fn(),
  reorderVaultSections: vi.fn(),
  updateVaultPublicationSection: (...args: unknown[]) => mockUpdatePublicationSection(...args),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

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
    mockFetch.mockReset();
    mockCreate.mockReset();
    mockUpdatePublicationSection.mockReset();
  });

  it('creates a section from the add-section form', async () => {
    mockFetch.mockResolvedValueOnce([]);
    const created: VaultSection = { id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' };
    mockCreate.mockResolvedValue(created);
    mockFetch.mockResolvedValueOnce([created]);

    render(<VaultSectionsPanel vaultId="v1" publications={[makePub()]} onPublicationsChange={() => {}} />);

    await waitFor(() => expect(screen.getByPlaceholderText(/section name/i)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/section name/i), { target: { value: 'starter_papers' } });
    fireEvent.click(screen.getByRole('button', { name: /add section/i }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({}, 'v1', { name: 'starter_papers', description: null, position: 0 }));
  });

  it('assigns a paper to a section', async () => {
    const section: VaultSection = { id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' };
    mockFetch.mockResolvedValue([section]);
    mockUpdatePublicationSection.mockResolvedValue(undefined);
    const onPublicationsChange = vi.fn();

    render(<VaultSectionsPanel vaultId="v1" publications={[makePub()]} onPublicationsChange={onPublicationsChange} />);

    await waitFor(() => expect(screen.getByText('Temporal Treemaps')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/section for temporal treemaps/i), { target: { value: 's1' } });

    await waitFor(() => expect(mockUpdatePublicationSection).toHaveBeenCalledWith({}, 'p1', { section_id: 's1', section_position: 0 }));
    expect(onPublicationsChange).toHaveBeenCalled();
  });

  it('toggles featured and saves a note for a sectioned paper', async () => {
    const section: VaultSection = { id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' };
    mockFetch.mockResolvedValue([section]);
    mockUpdatePublicationSection.mockResolvedValue(undefined);

    render(<VaultSectionsPanel vaultId="v1" publications={[makePub({ section_id: 's1' })]} onPublicationsChange={() => {}} />);

    await waitFor(() => expect(screen.getByLabelText(/feature temporal treemaps/i)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/feature temporal treemaps/i));

    await waitFor(() => expect(mockUpdatePublicationSection).toHaveBeenCalledWith({}, 'p1', { featured: true }));
  });

  it('reorders papers within a section by swapping section_position', async () => {
    const section: VaultSection = { id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' };
    mockFetch.mockResolvedValue([section]);
    mockUpdatePublicationSection.mockResolvedValue(undefined);

    const pub1 = makePub({ id: 'p1', title: 'First Paper', section_id: 's1', section_position: 0 });
    const pub2 = makePub({ id: 'p2', title: 'Second Paper', section_id: 's1', section_position: 1 });

    render(<VaultSectionsPanel vaultId="v1" publications={[pub1, pub2]} onPublicationsChange={() => {}} />);

    await waitFor(() => expect(screen.getByLabelText(/move first paper up within section/i)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/move second paper up within section/i));

    await waitFor(() => {
      expect(mockUpdatePublicationSection).toHaveBeenCalledWith({}, 'p1', { section_position: 1 });
      expect(mockUpdatePublicationSection).toHaveBeenCalledWith({}, 'p2', { section_position: 0 });
    });
  });
});
