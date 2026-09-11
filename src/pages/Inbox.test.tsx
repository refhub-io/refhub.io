import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { KeyboardProvider } from '@/contexts/KeyboardContext';
import { Inbox } from './Inbox';
import type { InboxItem } from '@/types/database';

function renderInbox() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <KeyboardProvider><Inbox /></KeyboardProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

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

// updateItemHints is a real, stateful setter here (not a bare vi.fn()) so
// tests can exercise the actual feedback loop between Inbox.tsx's scoring
// effect and the items it reads back -- a bare no-op mock would hide the
// exact bug (an infinite loop when a suggestion legitimately scores to
// null/null) this file regression-tests below.
let updateItemHintsCallCount = 0;
vi.mock('@/hooks/useInbox', () => ({
  useInbox: () => {
    const [items, setItems] = useState<InboxItem[]>(mockItems as InboxItem[]);
    const updateItemHints = (id: string, hints: Partial<InboxItem>) => {
      updateItemHintsCallCount += 1;
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...hints } : item)));
    };
    return {
      items, loading: false, createItem: vi.fn(), updateItemHints,
      acceptItem: mockAcceptItem, rejectItem: vi.fn(), mergeItem: vi.fn(), postponeItem: vi.fn(), refresh: vi.fn(),
    };
  },
}));

vi.mock('@/hooks/useAllPublications', () => ({
  useAllPublications: () => ({
    publications: [], vaults: mockVaults, tags: mockTags, publicationVaultsMap: {}, publicationTagsMap: {},
    tagsIncomplete: false, loading: false, refetch: mockRefetch,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' }, session: null }) }));

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: null, loading: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useVaults', () => ({
  useVaults: () => ({ ownedVaults: mockVaults, sharedVaults: [], sharedVaultRoles: {}, loading: false }),
  useInvalidateVaults: () => vi.fn(),
}));

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
      if (table === 'tags') {
        // Validates every selected tag belongs to the target vault before
        // inserting -- 'tag-1' is the only tag mockTags offers, so it's
        // always "valid" here.
        return {
          select: () => ({
            in: () => ({
              eq: () => Promise.resolve({ data: [{ id: 'tag-1' }], error: null }),
            }),
          }),
        };
      }
      return { insert: vi.fn(), select: vi.fn() };
    },
    rpc: (...args: unknown[]) => { mockRpc(...args); return Promise.resolve({ data: 'new-vault-pub-id', error: null }); },
  },
}));

describe('Inbox page', () => {
  beforeEach(() => {
    updateItemHintsCallCount = 0;
  });

  it('renders the capture form and the pending queue', async () => {
    renderInbox();
    expect(screen.getByRole('tab', { name: /doi/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Some Paper')).toBeInTheDocument());
  });

  it('accept creates a publication, copies it to the vault, and attaches tags via vault_publication_id', async () => {
    // Several sequential userEvent interactions each drive their own async
    // state update through the (now-stateful, see the useInbox mock above)
    // hook -- under full-suite parallel load this occasionally runs past the
    // default 5s per-test timeout even though nothing is actually hung.
    // Bumped rather than chased as a flake: isolated or small-parallel runs
    // of this file are consistently fast.
    //
    // Radix's Popover/Checkbox close-on-blur behavior in jsdom means fireEvent.click
    // is unreliable for driving them (the popover can close before the checkbox's own
    // click handler runs) — userEvent drives realistic pointer/focus sequences instead.
    const user = userEvent.setup();
    renderInbox();
    await waitFor(() => expect(screen.getByText('Some Paper')).toBeInTheDocument());

    // Select a vault so the "accept" button becomes enabled.
    await user.click(screen.getByRole('combobox', { name: /vault/i }));
    await user.click(await screen.findByRole('option', { name: 'My Vault' }));

    // Select a tag via the tag popover so the tag-insert path is exercised.
    await user.click(screen.getByRole('button', { name: /select_tags/i }));
    await user.click(await screen.findByRole('checkbox', { name: /important/i }));

    const acceptButton = await screen.findByRole('button', { name: /accept/i });
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
  }, 15000);

  it('scores an item exactly once even when no vault/tag/duplicate match is found', async () => {
    // Regression test for an infinite-loop bug: a real "no match found"
    // result leaves both suggested_vault_id and duplicate_of_publication_id
    // null, indistinguishable from "not yet scored" if that's the only
    // signal used to skip already-scored items -- updateItemHints's own
    // write then re-triggers the scoring effect forever. mockItems / the
    // mocked useAllPublications (publications: []) are set up so nothing
    // can possibly match, deliberately hitting that null/null case.
    renderInbox();
    await waitFor(() => expect(screen.getByText('Some Paper')).toBeInTheDocument());
    await waitFor(() => expect(updateItemHintsCallCount).toBe(1));

    // Give any runaway effect a chance to fire again before asserting it stayed put.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updateItemHintsCallCount).toBe(1);
  });
});
