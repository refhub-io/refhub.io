import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { dismissQuoterm, getQuotermsSnapshot } from 'quoterm';
import { useVaultAccess } from './useVaultAccess';
import { hasPageCache } from '../lib/pageCache';
import { setCacheOwner } from '../lib/cacheOwner';
import type { Vault } from '../types/database';

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockGetSession = vi.fn();
const mockRpc = vi.fn();

vi.mock('../integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    from: (table: string) => {
      if (table === 'vaults') {
        return { select: () => ({ eq: () => ({ single: mockSingle }) }) };
      }
      if (table === 'vault_shares' || table === 'vault_access_requests') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

function makeVault(overrides: Partial<Vault> = {}): Vault {
  return {
    id: 'vault-1', user_id: 'owner-1', name: 'Test Vault', description: null,
    color: '#6366f1', visibility: 'private', public_slug: null, category: null,
    abstract: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    archived_at: null, ...overrides,
  };
}

function mockSignedIn(userId: string) {
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: userId, email: `${userId}@example.com` } } }, error: null });
}

function mockSignedOut() {
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
}

describe('useVaultAccess archived-vault behavior', () => {
  beforeEach(() => {
    mockSingle.mockReset();
    mockMaybeSingle.mockReset();
    mockGetSession.mockReset();
    mockRpc.mockReset();
  });

  it('denies edit access to the owner of an archived vault, but still grants view', async () => {
    mockSignedIn('owner-1');
    mockSingle.mockResolvedValue({ data: makeVault({ archived_at: '2026-09-01T00:00:00Z' }), error: null });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('granted'));
    expect(result.current.canView).toBe(true);
    expect(result.current.canEdit).toBe(false);
    expect(result.current.isOwner).toBe(true);
    expect(result.current.isArchived).toBe(true);
  });

  it('grants full edit access to the owner of a non-archived vault (unchanged behavior)', async () => {
    mockSignedIn('owner-1');
    mockSingle.mockResolvedValue({ data: makeVault({ archived_at: null }), error: null });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('granted'));
    expect(result.current.canEdit).toBe(true);
    expect(result.current.isArchived).toBe(false);
  });

  it('denies edit access to an editor-share collaborator on an archived vault', async () => {
    mockSignedIn('collaborator-1');
    mockSingle.mockResolvedValue({ data: makeVault({ archived_at: '2026-09-01T00:00:00Z' }), error: null });
    mockMaybeSingle.mockResolvedValue({ data: { role: 'editor' }, error: null });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('granted'));
    expect(result.current.canView).toBe(true);
    expect(result.current.canEdit).toBe(false);
    expect(result.current.isArchived).toBe(true);
  });

  it('keeps a public archived vault viewable but not editable for an anonymous visitor', async () => {
    mockSignedOut();
    mockSingle.mockResolvedValue({ data: makeVault({ visibility: 'public', archived_at: '2026-09-01T00:00:00Z' }), error: null });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('granted'));
    expect(result.current.canView).toBe(true);
    expect(result.current.canEdit).toBe(false);
    expect(result.current.isArchived).toBe(true);
  });

  it('returns isArchived as a defined boolean immediately on mount, before the vault fetch resolves', () => {
    mockSignedIn('owner-1');
    mockSingle.mockResolvedValue({ data: makeVault(), error: null });

    const { result } = renderHook(() => useVaultAccess('vault-fresh-mount-test', { enableRealtime: false }));

    // Synchronous assertion: the cache-miss reset (no page cache in this test env)
    // must leave isArchived as a real boolean, not undefined, before any async data arrives.
    expect(typeof result.current.isArchived).toBe('boolean');
    expect(result.current.isArchived).toBe(false);
  });
});

describe('useVaultAccess — signed-out visitor', () => {
  beforeEach(() => {
    mockSingle.mockReset();
    mockMaybeSingle.mockReset();
    mockGetSession.mockReset();
    mockRpc.mockReset();
  });

  afterEach(() => {
    dismissQuoterm();
  });

  it('reaches requestable for a protected vault instead of crashing into denied', async () => {
    // The direct row select is RLS-blocked for a protected vault when signed
    // out — PostgREST reports this as PGRST116 (no rows), same as a genuine
    // miss, and the hook falls back to the get_vault_metadata RPC.
    mockSignedOut();
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    mockRpc.mockResolvedValue({
      data: [{ id: 'vault-1', name: 'Protected Vault', description: null, visibility: 'protected', color: '#000', updated_at: '', created_at: '' }],
      error: null,
    });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('requestable'));
    expect(result.current.canView).toBe(false);
    expect(result.current.vault?.visibility).toBe('protected');
  });

  it('grants view of a public vault reached directly by id', async () => {
    mockSignedOut();
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    mockRpc.mockResolvedValue({
      data: [{ id: 'vault-1', name: 'Public Vault', description: null, visibility: 'public', color: '#000', updated_at: '', created_at: '' }],
      error: null,
    });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('granted'));
    expect(result.current.canView).toBe(true);
  });

  it('reports denied (not a crash) for a private or nonexistent vault', async () => {
    mockSignedOut();
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('denied'));
    expect(result.current.vault).toBeNull();
  });

  it('reports a failed metadata RPC as a retryable error (with a toast), not as denied', async () => {
    mockSignedOut();
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network error' } });

    // Its own vault id: an earlier test cached 'vault-1' as granted, which makes this check
    // a background refresh, and a failed background refresh keeps the cached answer.
    const { result } = renderHook(() => useVaultAccess('vault-rpc-err', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('error'));
    expect(result.current.canView).toBe(false);
    expect(getQuotermsSnapshot().items[0]).toMatchObject({
      title: 'Could not check vault access',
      variant: 'error',
    });
  });
});

describe('useVaultAccess — failed checks are errors, not denials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a failed vault query (anything but "no rows") as error', async () => {
    mockSignedIn('user-1');
    mockSingle.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });

    const { result } = renderHook(() => useVaultAccess('vault-err-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('error'));
    expect(result.current.error).toBe('Could not check vault access');
  });

  it('reports a failed share lookup as error, instead of treating it as "no share"', async () => {
    mockSignedIn('user-1');
    mockSingle.mockResolvedValue({ data: makeVault({ user_id: 'owner-1', visibility: 'protected' }), error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const { result } = renderHook(() => useVaultAccess('vault-err-2', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('error'));
  });

  // VaultDetail and VaultContentContext each run their own check on the same vault. When both
  // fail, the retry button on the page has to recover both, or the vault opens with no papers.
  it('retries a failed check in every instance for the vault, not only the one retried', async () => {
    mockSignedIn('owner-1');
    mockSingle.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });

    const page = renderHook(() => useVaultAccess('vault-err-3', { enableRealtime: false }));
    const content = renderHook(() => useVaultAccess('vault-err-3', { enableRealtime: false }));
    await waitFor(() => expect(page.result.current.accessStatus).toBe('error'));
    await waitFor(() => expect(content.result.current.accessStatus).toBe('error'));

    mockSingle.mockResolvedValue({ data: makeVault({ id: 'vault-err-3' }), error: null });
    act(() => page.result.current.refresh());

    await waitFor(() => expect(page.result.current.accessStatus).toBe('granted'));
    await waitFor(() => expect(content.result.current.accessStatus).toBe('granted'));
    expect(content.result.current.canView).toBe(true);
  });

  it('leaves an instance whose check succeeded alone when another instance retries', async () => {
    mockSignedIn('owner-1');
    mockSingle
      .mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })
      .mockResolvedValue({ data: makeVault({ id: 'vault-err-4' }), error: null });

    const page = renderHook(() => useVaultAccess('vault-err-4', { enableRealtime: false }));
    const content = renderHook(() => useVaultAccess('vault-err-4', { enableRealtime: false }));
    await waitFor(() => expect(page.result.current.accessStatus).toBe('error'));
    await waitFor(() => expect(content.result.current.accessStatus).toBe('granted'));
    const callsBeforeRetry = mockSingle.mock.calls.length;

    act(() => page.result.current.refresh());

    await waitFor(() => expect(page.result.current.accessStatus).toBe('granted'));
    expect(mockSingle.mock.calls.length).toBe(callsBeforeRetry + 1);
  });
});

describe('useVaultAccess — signed-in visitor with no explicit share, public vault', () => {
  beforeEach(() => {
    mockSingle.mockReset();
    mockMaybeSingle.mockReset();
    mockGetSession.mockReset();
    mockRpc.mockReset();
  });

  it('resolves permission to viewer, not null, for a signed-in non-owner with no share row', async () => {
    mockSignedIn('random-user-1');
    mockSingle.mockResolvedValue({ data: makeVault({ user_id: 'owner-1', visibility: 'public' }), error: null });
    // Same mock backs both the vault_shares and vault_access_requests
    // lookups (and the by-email share fallback) — none of them find a row.
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('granted'));
    expect(result.current.canView).toBe(true);
    expect(result.current.permission).toBe('viewer');
  });

  it('still grants baseline viewer permission on a public vault when the visitor has a PENDING editor request', async () => {
    // Reproduces the exact bug: clicking "collaborate" on a public vault
    // (requesting an editor upgrade) left permission null forever after,
    // because a pending request unconditionally blocked canView before
    // the code ever checked whether the vault was public.
    mockSignedIn('random-user-1');
    mockSingle.mockResolvedValue({ data: makeVault({ user_id: 'owner-1', visibility: 'public' }), error: null });
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // share by user id — none
      .mockResolvedValueOnce({ data: null, error: null }) // share by email — none
      .mockResolvedValueOnce({ data: { status: 'pending' }, error: null }); // pending editor request

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('granted'));
    expect(result.current.canView).toBe(true);
    expect(result.current.permission).toBe('viewer');
  });

  it('keeps a pending request blocking view on a protected (non-public) vault, unchanged', async () => {
    mockSignedIn('random-user-1');
    mockSingle.mockResolvedValue({ data: makeVault({ user_id: 'owner-1', visibility: 'protected' }), error: null });
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { status: 'pending' }, error: null });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('pending'));
    expect(result.current.canView).toBe(false);
    expect(result.current.permission).toBeNull();
  });
});

describe('useVaultAccess — caching a denied result', () => {
  beforeEach(() => {
    mockSingle.mockReset();
    mockMaybeSingle.mockReset();
    mockGetSession.mockReset();
    mockRpc.mockReset();
  });

  it('does not cache a failed check, so a later visit can recover', async () => {
    // Simulates the failure mode behind the false "no_access" badge bug: a
    // transient error (network blip, RLS hiccup) throws partway through the
    // check. It's reported as 'error', not 'denied', and must never be
    // cached, or later renders in the session would restore it instead of
    // re-checking.
    mockGetSession.mockRejectedValue(new Error('network blip'));

    const { result } = renderHook(() => useVaultAccess('vault-cache-test', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('error'));
    expect(hasPageCache('vault-access-vault-cache-test')).toBe(false);
  });
});

describe('useVaultAccess — the signed-in user changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A vault page can stay open through a user switch, for example one made in another tab.
  it("drops the previous user's answer at once and checks again for the new user", async () => {
    setCacheOwner('owner-1');
    mockSignedIn('owner-1');
    mockSingle.mockResolvedValue({ data: makeVault({ id: 'vault-switch' }), error: null });

    const { result } = renderHook(() => useVaultAccess('vault-switch', { enableRealtime: false }));
    await waitFor(() => expect(result.current.accessStatus).toBe('granted'));

    mockSignedIn('someone-else');
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    mockRpc.mockResolvedValue({ data: [], error: null });
    act(() => setCacheOwner('someone-else'));

    expect(result.current.canView).toBe(false);
    expect(result.current.isOwner).toBe(false);
    await waitFor(() => expect(result.current.accessStatus).toBe('denied'));
    expect(result.current.vault).toBeNull();
  });
});
