import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardProvider } from '@/contexts/KeyboardContext';
import { Vault } from '@/types/database';
import type { RelationshipSuggestion } from '@/lib/relationshipSuggestions';
import { runVaultRelationshipScan } from '@/lib/vaultRelationshipScan';
import { VaultDialog } from '../VaultDialog';

// VaultDialog fetches its own vault-scoped publications (by vault.id) instead of trusting a
// caller-supplied prop — see the fix for the vault-scoping bug. `mockState.vaultPublicationRows`
// is what the mocked `vault_publications` query resolves to; tests that exercise the
// "relationships" tab gating override it directly, everything else gets the shared default.
const { mockState, defaultVaultPublicationRows } = vi.hoisted(() => {
  const defaultVaultPublicationRows = [
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
  ];
  return {
    defaultVaultPublicationRows,
    mockState: { vaultPublicationRows: defaultVaultPublicationRows as unknown[] },
  };
});

vi.mock('@/lib/vaultRelationshipScan', () => ({
  runVaultRelationshipScan: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'user@example.com' },
    session: null,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'vault_publications') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn(() => Promise.resolve({ data: mockState.vaultPublicationRows, error: null })),
        };
      }
      if (table === 'publication_relations') {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
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

const mockSuggestion: RelationshipSuggestion = {
  sourcePublicationId: 'pub-1',
  sourceTitle: 'Source Paper',
  targetPublicationId: 'pub-2',
  targetTitle: 'Target Paper',
  discoveredVia: 'references',
};

const renderDialog = (overrides: Record<string, unknown> = {}) => render(
  <KeyboardProvider>
    <VaultDialog
      open
      onOpenChange={vi.fn()}
      vault={mockVault}
      onSave={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />
  </KeyboardProvider>,
);

/** Switches to the relationships tab, runs a scan (mocked to resolve one suggestion), and
 * waits for it to render, then switches back to the settings tab so a name edit can be made. */
async function scanForOneSuggestionThenReturnToSettings() {
  vi.mocked(runVaultRelationshipScan).mockResolvedValue({
    suggestions: [mockSuggestion],
    skippedCount: 0,
  });

  const relationshipsTab = await screen.findByRole('tab', { name: /relationship suggestions/i });
  fireEvent.mouseDown(relationshipsTab);

  const scanButton = await screen.findByRole('button', { name: /scan for relationships/i });
  fireEvent.click(scanButton);

  await waitFor(() => {
    expect(screen.getByText('Source Paper')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
  });

  fireEvent.mouseDown(screen.getByRole('tab', { name: /vault settings/i }));
}

describe('VaultDialog unsaved changes + relationship suggestions guard', () => {
  beforeEach(() => {
    vi.mocked(runVaultRelationshipScan).mockReset();
    mockState.vaultPublicationRows = defaultVaultPublicationRows;
  });

  // These two tests drive a full tab-switch + scan + tab-switch-back + edit + discard/save
  // sequence, which does noticeably more work than the suite average and can run close to
  // the default testTimeout under parallel load; give them more headroom.
  it('shows pending-relationships dialog instead of closing when discarding unsaved changes with pending suggestions', async () => {
    const onOpenChange = vi.fn();

    renderDialog({
      onOpenChange,
      vault: { ...mockVault, name: 'Original Name' },
    });

    await scanForOneSuggestionThenReturnToSettings();

    // Simulate unsaved changes by changing the vault name
    const nameInput = screen.getByDisplayValue('Original Name');
    fireEvent.change(nameInput, { target: { value: 'Modified Name' } });

    await waitFor(() => {
      expect(nameInput).toHaveValue('Modified Name');
    });

    // Click cancel button which should trigger handleDialogClose
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    // UnsavedChangesDialog should appear
    await waitFor(() => {
      expect(screen.getByText(/unsaved_changes/i)).toBeInTheDocument();
    });

    // Click the discard button on the unsaved changes dialog
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));

    // With pending relationship suggestions, discarding must surface the pending-relationships
    // dialog instead of closing the vault dialog outright.
    await waitFor(() => {
      expect(screen.getByText(/unreviewed relationship suggestion/i)).toBeInTheDocument();
    });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  }, 15000);

  it('shows pending-relationships dialog after successfully saving with unsaved changes', async () => {
    const onOpenChange = vi.fn();
    const onSave = vi.fn().mockResolvedValue(mockVault);

    renderDialog({
      onOpenChange,
      onSave,
      vault: { ...mockVault, name: 'Original Name' },
    });

    await scanForOneSuggestionThenReturnToSettings();

    // Simulate unsaved changes
    const nameInput = screen.getByDisplayValue('Original Name');
    fireEvent.change(nameInput, { target: { value: 'Modified Name' } });

    await waitFor(() => {
      expect(nameInput).toHaveValue('Modified Name');
    });

    // Click cancel to trigger the unsaved changes dialog
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    // Wait for unsaved changes dialog
    await waitFor(() => {
      expect(screen.getByText(/unsaved_changes/i)).toBeInTheDocument();
    });

    // Click "Save and close"
    const saveAndCloseButton = screen.getAllByRole('button').find(
      (btn) => btn.textContent?.includes('save') && !btn.textContent?.includes('saving')
    );
    expect(saveAndCloseButton).toBeDefined();
    fireEvent.click(saveAndCloseButton!);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    // With pending relationship suggestions, saving must surface the pending-relationships
    // dialog afterward instead of closing the vault dialog outright.
    await waitFor(() => {
      expect(screen.getByText(/unreviewed relationship suggestion/i)).toBeInTheDocument();
    });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  }, 15000);
});

describe('VaultDialog "relationships" tab gating (Important 3)', () => {
  beforeEach(() => {
    vi.mocked(runVaultRelationshipScan).mockReset();
    mockState.vaultPublicationRows = defaultVaultPublicationRows;
  });

  it('hides the relationships tab when there is no vault-wide publication data', async () => {
    mockState.vaultPublicationRows = [];
    renderDialog();

    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: /relationship suggestions/i })).not.toBeInTheDocument();
    });
    // The "sections" tab is gated on `vault` alone and must remain unaffected.
    expect(screen.getByRole('tab', { name: /curated sections/i })).toBeInTheDocument();
  });

  it('shows the relationships tab when publications are available', async () => {
    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /relationship suggestions/i })).toBeInTheDocument();
    });
  });
});
