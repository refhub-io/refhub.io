import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardProvider } from '@/contexts/KeyboardContext';
import { Publication, Vault } from '@/types/database';
import { runVaultRelationshipScan } from '@/lib/vaultRelationshipScan';
import { VaultDialog } from '../VaultDialog';

vi.mock('@/lib/vaultRelationshipScan', () => ({
  runVaultRelationshipScan: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'user@example.com' }, session: null }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
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

const basePublication: Publication = {
  id: 'pub-1',
  user_id: 'user-1',
  title: 'Source Paper',
  authors: ['Author One'],
  year: 2020,
  journal: null,
  volume: null,
  issue: null,
  pages: null,
  doi: null,
  url: null,
  abstract: null,
  pdf_url: null,
  bibtex_key: null,
  publication_type: 'article',
  notes: null,
  booktitle: null,
  chapter: null,
  edition: null,
  editor: null,
  howpublished: null,
  institution: null,
  number: null,
  organization: null,
  publisher: null,
  school: null,
  series: null,
  type: null,
  eid: null,
  isbn: null,
  issn: null,
  keywords: null,
  reading_state: 'unread',
  important: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const mockPublications: Publication[] = [basePublication, { ...basePublication, id: 'pub-2', title: 'Target Paper' }];

const renderDialog = () => render(
  <KeyboardProvider>
    <VaultDialog
      open
      onOpenChange={vi.fn()}
      vault={mockVault}
      onSave={vi.fn().mockResolvedValue(undefined)}
      publications={mockPublications}
      existingRelations={[]}
    />
  </KeyboardProvider>,
);

const openRelationshipsTab = () => {
  fireEvent.mouseDown(screen.getByRole('tab', { name: /relationship suggestions/i }));
};

describe('VaultDialog — force_rescan visibility', () => {
  beforeEach(() => {
    vi.mocked(runVaultRelationshipScan).mockReset();
  });

  it('hides force_rescan before any scan has run', () => {
    renderDialog();
    openRelationshipsTab();
    expect(screen.queryByRole('button', { name: /force_rescan/i })).not.toBeInTheDocument();
  });

  it('shows force_rescan after a plain scan skips cached papers, and hides it again once a force-rescan checks everything fresh', async () => {
    renderDialog();
    openRelationshipsTab();

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
    openRelationshipsTab();

    vi.mocked(runVaultRelationshipScan).mockResolvedValue({ suggestions: [], skippedCount: 0 });
    fireEvent.click(screen.getByRole('button', { name: /^scan for relationships$/i }));

    await waitFor(() => {
      expect(vi.mocked(runVaultRelationshipScan)).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: /force_rescan/i })).not.toBeInTheDocument();
  });
});
