import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { dismissQuoterm, getQuotermsSnapshot } from 'quoterm';
import { useVaultAccess } from './useVaultAccess';
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

  it('surfaces a toast when the metadata RPC itself fails, distinct from a genuine miss', async () => {
    mockSignedOut();
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network error' } });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('denied'));
    expect(getQuotermsSnapshot().items[0]).toMatchObject({
      title: 'Could not check vault access',
      variant: 'error',
    });
  });
});
