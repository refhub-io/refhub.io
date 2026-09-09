import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardProvider } from '@/contexts/KeyboardContext';
import { Vault } from '@/types/database';
import { runVaultRelationshipScan } from '@/lib/vaultRelationshipScan';
import { formatVaultPublication } from '@/lib/formatVaultPublication';
import { VaultDialog } from '../VaultDialog';

// VaultDialog fetches its own vault-scoped publications/relations (by vault.id) rather than
// trusting caller-supplied props — see the fix for the vault-scoping bug where opening vault
// B's settings from a page displaying vault A scanned vault A's data. These raw DB-shape rows
// are what the mocked `vault_publications` query below returns.
const { mockVaultPublicationRows, makePagedChain } = vi.hoisted(() => ({
  // VaultDialog pages both queries via fetchAllRows(), which chains
  // .select()/.eq()/.order()/.order()/.range() and awaits the final link —
  // every method but the terminal .range() must stay chainable.
  makePagedChain: (data: unknown[]) => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ['select', 'eq', 'order']) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    chain.range = vi.fn().mockResolvedValue({ data, error: null });
    return chain;
  },
  mockVaultPublicationRows: [
    {
      id: 'pub-1',
      vault_id: 'vault-1',
      original_publication_id: null,
      created_by: 'user-1',
      title: 'Source Paper',
      authors: ['Author One'],
      year: 2020,
      doi: null,
      reading_state: 'unread',
      important: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'pub-2',
      vault_id: 'vault-1',
      original_publication_id: null,
      created_by: 'user-1',
      title: 'Target Paper',
      authors: ['Author One'],
      year: 2020,
      doi: null,
      reading_state: 'unread',
      important: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ],
}));

vi.mock('@/lib/vaultRelationshipScan', () => ({
  runVaultRelationshipScan: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'user@example.com' }, session: null }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'vault_publications') {
        return makePagedChain(mockVaultPublicationRows);
      }
      if (table === 'publication_relations') {
        return makePagedChain([]);
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue(undefined),
    })),
    removeChannel: vi.fn(),
  },
}));

const mockVault: Vault = {
  id: 'vault-1',
  user_id: 'user-1',
  name: 'Test Vault',
  description: 'A test vault',
  color: '#a855f7',
  category: 'research',
  abstract: 'Test abstract',
  visibility: 'private',
  public_slug: null,
  archived_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// The exact publications VaultDialog will build from mockVaultPublicationRows via its own
// fetch — computed with the real transform so this assertion can never drift from it.
const mockPublications = mockVaultPublicationRows.map(formatVaultPublication);

const renderDialog = () => render(
  <KeyboardProvider>
    <VaultDialog
      open
      onOpenChange={vi.fn()}
      vault={mockVault}
      onSave={vi.fn().mockResolvedValue(undefined)}
    />
  </KeyboardProvider>,
);

const openRelationshipsTab = async () => {
  const tab = await screen.findByRole('tab', { name: /relationship suggestions/i });
  fireEvent.mouseDown(tab);
};

describe('VaultDialog — force_rescan visibility', () => {
  beforeEach(() => {
    vi.mocked(runVaultRelationshipScan).mockReset();
  });

  it('hides force_rescan before any scan has run', async () => {
    renderDialog();
    await openRelationshipsTab();
    expect(screen.queryByRole('button', { name: /force_rescan/i })).not.toBeInTheDocument();
  });

  it('shows force_rescan after a plain scan skips cached papers, and hides it again once a force-rescan checks everything fresh', async () => {
    renderDialog();
    await openRelationshipsTab();

    vi.mocked(runVaultRelationshipScan).mockResolvedValue({ suggestions: [], skippedCount: 2 });
    fireEvent.click(screen.getByRole('button', { name: /^scan for relationships$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /force_rescan/i })).toBeInTheDocument();
    });

    // A force-rescan (skipRecentMs: 0) can never itself skip anything, so
    // the button should disappear again once it resolves.
    vi.mocked(runVaultRelationshipScan).mockResolvedValue({ suggestions: [], skippedCount: 0 });
    fireEvent.click(screen.getByRole('button', { name: /force_rescan/i }));

    expect(vi.mocked(runVaultRelationshipScan)).toHaveBeenLastCalledWith(
      mockPublications,
      [],
      expect.any(Function),
      { skipRecentMs: 0 },
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /force_rescan/i })).not.toBeInTheDocument();
    });
  });

  it('does not show force_rescan when a plain scan genuinely finds nothing (no skips)', async () => {
    renderDialog();
    await openRelationshipsTab();

    vi.mocked(runVaultRelationshipScan).mockResolvedValue({ suggestions: [], skippedCount: 0 });
    fireEvent.click(screen.getByRole('button', { name: /^scan for relationships$/i }));

    await waitFor(() => {
      expect(vi.mocked(runVaultRelationshipScan)).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: /force_rescan/i })).not.toBeInTheDocument();
  });
});
