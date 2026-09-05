import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardProvider } from '@/contexts/KeyboardContext';
import { Inbox } from './Inbox';

const mockItems = [{
  id: 'item-1', user_id: 'user-1', status: 'pending', source_type: 'manual', source_ref: 'Some Paper',
  parsed_fields: { title: 'Some Paper', authors: ['A'], year: 2020 },
  suggested_vault_id: null, suggested_tag_ids: null, duplicate_of_publication_id: null,
  filed_publication_id: null, sort_order: 0,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
}];

vi.mock('@/hooks/useInbox', () => ({
  useInbox: () => ({
    items: mockItems, loading: false, createItem: vi.fn(), updateItemHints: vi.fn(),
    acceptItem: vi.fn(), rejectItem: vi.fn(), mergeItem: vi.fn(), postponeItem: vi.fn(), refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/useAllPublications', () => ({
  useAllPublications: () => ({
    publications: [], vaults: [], tags: [], publicationVaultsMap: {}, publicationTagsMap: {},
    tagsIncomplete: false, loading: false, refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' }, session: null }) }));

describe('Inbox page', () => {
  it('renders the capture form and the pending queue', async () => {
    render(<KeyboardProvider><Inbox /></KeyboardProvider>);
    expect(screen.getByRole('tab', { name: /doi/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Some Paper')).toBeInTheDocument());
  });
});
