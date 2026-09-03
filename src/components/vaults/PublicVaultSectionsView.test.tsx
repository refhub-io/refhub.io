// src/components/vaults/PublicVaultSectionsView.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicVaultSectionsView } from './PublicVaultSectionsView';
import type { Publication, Vault, VaultSection } from '@/types/database';

const mockFetch = vi.fn();
vi.mock('@/lib/vaultSections', () => ({
  fetchVaultSections: (...args: unknown[]) => mockFetch(...args),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

function makeVault(overrides: Partial<Vault> = {}): Vault {
  return {
    id: 'v1', user_id: 'u1', name: 'treemaps_lab', description: null, color: '#a855f7',
    visibility: 'public', public_slug: 'treemaps-lab', category: null, abstract: null,
    created_at: '', updated_at: '', archived_at: null, ...overrides,
  };
}

function makePub(overrides: Partial<Publication>): Publication {
  return {
    id: overrides.id ?? 'p1', user_id: 'u1', title: overrides.title ?? 'Untitled', authors: [],
    year: null, journal: null, volume: null, issue: null, pages: null, doi: null, url: null,
    abstract: null, pdf_url: null, bibtex_key: null, publication_type: 'article', notes: null,
    booktitle: null, chapter: null, edition: null, editor: null, howpublished: null,
    institution: null, number: null, organization: null, publisher: null, school: null,
    series: null, type: null, eid: null, isbn: null, issn: null, keywords: null,
    reading_state: 'unread', important: false, created_at: '', updated_at: '',
    section_id: null, section_position: 0, featured: false, featured_note: null,
    ...overrides,
  };
}

describe('PublicVaultSectionsView', () => {
  it('groups papers by section, in section then paper order, and excludes unsectioned papers', async () => {
    const sections: VaultSection[] = [
      { id: 's2', vault_id: 'v1', name: 'evaluation', description: null, position: 1, created_at: '', updated_at: '' },
      { id: 's1', vault_id: 'v1', name: 'starter_papers', description: 'read first', position: 0, created_at: '', updated_at: '' },
    ];
    mockFetch.mockResolvedValue(sections);

    const publications = [
      makePub({ id: 'p1', title: 'In starter, second', section_id: 's1', section_position: 1 }),
      makePub({ id: 'p2', title: 'In evaluation', section_id: 's2', section_position: 0 }),
      makePub({ id: 'p3', title: 'Unsectioned', section_id: null }),
      makePub({ id: 'p4', title: 'In starter, first', section_id: 's1', section_position: 0 }),
    ];

    render(
      <PublicVaultSectionsView
        vault={makeVault()}
        publications={publications}
        tags={[]}
        onOpenPublication={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText('starter_papers')).toBeInTheDocument());
    expect(screen.getByText('read first')).toBeInTheDocument();
    expect(screen.queryByText('Unsectioned')).not.toBeInTheDocument();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent);
    expect(headings).toEqual(['starter_papers', 'evaluation']);

    const titles = [screen.getByText('In starter, first'), screen.getByText('In starter, second')];
    expect(titles[0].compareDocumentPosition(titles[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a star and note for a featured paper', async () => {
    const sections: VaultSection[] = [{ id: 's1', vault_id: 'v1', name: 'starter_papers', description: null, position: 0, created_at: '', updated_at: '' }];
    mockFetch.mockResolvedValue(sections);

    render(
      <PublicVaultSectionsView
        vault={makeVault()}
        publications={[makePub({ id: 'p1', title: 'Featured Paper', section_id: 's1', featured: true, featured_note: 'why it matters' })]}
        tags={[]}
        onOpenPublication={() => {}}
      />,
    );

    // The note renders inline as part of one combined text node
    // ("★ featured — why it matters"), so match by substring, not exact string.
    await waitFor(() => expect(screen.getByText(/why it matters/)).toBeInTheDocument());
  });
});
