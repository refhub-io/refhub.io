import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useVaultAccess } from './useVaultAccess';
import type { Vault } from '../types/database';

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockGetUser = vi.fn();

vi.mock('../integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (table: string) => {
      if (table === 'vaults') {
        return { select: () => ({ eq: () => ({ single: mockSingle }) }) };
      }
      if (table === 'vault_shares' || table === 'vault_access_requests') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: vi.fn(),
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

describe('useVaultAccess archived-vault behavior', () => {
  beforeEach(() => {
    mockSingle.mockReset();
    mockMaybeSingle.mockReset();
    mockGetUser.mockReset();
  });

  it('denies edit access to the owner of an archived vault, but still grants view', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'owner-1', email: 'owner@example.com' } }, error: null });
    mockSingle.mockResolvedValue({ data: makeVault({ archived_at: '2026-09-01T00:00:00Z' }), error: null });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('granted'));
    expect(result.current.canView).toBe(true);
    expect(result.current.canEdit).toBe(false);
    expect(result.current.isOwner).toBe(true);
    expect(result.current.isArchived).toBe(true);
  });

  it('grants full edit access to the owner of a non-archived vault (unchanged behavior)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'owner-1', email: 'owner@example.com' } }, error: null });
    mockSingle.mockResolvedValue({ data: makeVault({ archived_at: null }), error: null });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('granted'));
    expect(result.current.canEdit).toBe(true);
    expect(result.current.isArchived).toBe(false);
  });

  it('denies edit access to an editor-share collaborator on an archived vault', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'collaborator-1', email: 'collab@example.com' } }, error: null });
    mockSingle.mockResolvedValue({ data: makeVault({ archived_at: '2026-09-01T00:00:00Z' }), error: null });
    mockMaybeSingle.mockResolvedValue({ data: { role: 'editor' }, error: null });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('granted'));
    expect(result.current.canView).toBe(true);
    expect(result.current.canEdit).toBe(false);
    expect(result.current.isArchived).toBe(true);
  });

  it('keeps a public archived vault viewable but not editable for an anonymous visitor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockSingle.mockResolvedValue({ data: makeVault({ visibility: 'public', archived_at: '2026-09-01T00:00:00Z' }), error: null });

    const { result } = renderHook(() => useVaultAccess('vault-1', { enableRealtime: false }));

    await waitFor(() => expect(result.current.accessStatus).toBe('granted'));
    expect(result.current.canView).toBe(true);
    expect(result.current.canEdit).toBe(false);
    expect(result.current.isArchived).toBe(true);
  });
});
