import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const mockVaults = [{
  id: 'vault-1', user_id: 'user-1', name: 'My Vault', description: '', color: '#000',
  category: 'research', abstract: '', visibility: 'private', public_slug: null,
  archived_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
}];

const mockTags = [{
  id: 'tag-1', user_id: 'user-1', name: 'Important', color: '#ff0000',
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
}];

const mockAcceptItem = vi.fn();
const mockRefetch = vi.fn();

vi.mock('@/hooks/useInbox', () => ({
  useInbox: () => ({
    items: mockItems, loading: false, createItem: vi.fn(), updateItemHints: vi.fn(),
    acceptItem: mockAcceptItem, rejectItem: vi.fn(), mergeItem: vi.fn(), postponeItem: vi.fn(), refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/useAllPublications', () => ({
  useAllPublications: () => ({
    publications: [], vaults: mockVaults, tags: mockTags, publicationVaultsMap: {}, publicationTagsMap: {},
    tagsIncomplete: false, loading: false, refetch: mockRefetch,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' }, session: null }) }));

// Mocks for the "accept" flow's Supabase calls: a plain publications insert, the
// copy_publication_to_vault RPC (which returns the new vault_publications.id as a
// scalar), and the publication_tags insert — captured so we can assert the tag
// insert is keyed by vault_publication_id, not publication_id.
const mockInsert = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'publications') {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'new-pub-id', title: 'Some Paper' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'publication_tags') {
        return { insert: (...args: unknown[]) => { mockInsert(...args); return Promise.resolve({ data: null, error: null }); } };
      }
      return { insert: vi.fn(), select: vi.fn() };
    },
    rpc: (...args: unknown[]) => { mockRpc(...args); return Promise.resolve({ data: 'new-vault-pub-id', error: null }); },
  },
}));

describe('Inbox page', () => {
  it('renders the capture form and the pending queue', async () => {
    render(<KeyboardProvider><Inbox /></KeyboardProvider>);
    expect(screen.getByRole('tab', { name: /doi/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Some Paper')).toBeInTheDocument());
  });

  it('accept creates a publication, copies it to the vault, and attaches tags via vault_publication_id', async () => {
    // Radix's Popover/Checkbox close-on-blur behavior in jsdom means fireEvent.click
    // is unreliable for driving them (the popover can close before the checkbox's own
    // click handler runs) — userEvent drives realistic pointer/focus sequences instead.
    const user = userEvent.setup();
    render(<KeyboardProvider><Inbox /></KeyboardProvider>);
    await waitFor(() => expect(screen.getByText('Some Paper')).toBeInTheDocument());

    // Select a vault so the "accept" button becomes enabled.
    await user.click(screen.getByRole('combobox', { name: /vault/i }));
    await user.click(await screen.findByRole('option', { name: 'My Vault' }));

    // Select a tag via the tag popover so the tag-insert path is exercised.
    await user.click(screen.getByRole('button', { name: /select tags/i }));
    await user.click(await screen.findByRole('checkbox', { name: /important/i }));

    const acceptButton = await screen.findByRole('button', { name: /^accept$/i });
    await waitFor(() => expect(acceptButton).not.toBeDisabled());
    await user.click(acceptButton);

    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith(
      'copy_publication_to_vault',
      expect.objectContaining({ pub_id: 'new-pub-id', target_vault_id: 'vault-1' }),
    ));
    await waitFor(() => expect(mockInsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({
        vault_publication_id: 'new-vault-pub-id', publication_id: null, tag_id: 'tag-1',
      })]),
    ));
    await waitFor(() => expect(mockAcceptItem).toHaveBeenCalledWith('item-1', 'vault-1', ['tag-1'], 'new-pub-id'));
  });
});
