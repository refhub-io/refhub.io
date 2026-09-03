import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchUserVaults } from './vaults';
import type { Vault } from '@/types/database';

type MockError = { message: string };

function resolveOrError<T>(rows: T[] | undefined, error: MockError | undefined) {
  if (error) return Promise.resolve({ data: null, error });
  return Promise.resolve({ data: rows ?? [], error: null });
}

function makeClient(data: {
  ownedVaults?: Vault[];
  sharedVaultDetails?: Vault[];
  vaultShares?: { vault_id: string; role?: string }[];
  errors?: {
    ownedVaults?: MockError;
    vaultShares?: MockError;
    sharedVaultDetails?: MockError;
  };
}): SupabaseClient {
  const errors = data.errors ?? {};
  const from = (table: string) => {
    switch (table) {
      case 'vaults':
        return {
          select: () => ({
            eq: () => ({
              order: () => resolveOrError(data.ownedVaults, errors.ownedVaults),
            }),
            in: () => resolveOrError(data.sharedVaultDetails, errors.sharedVaultDetails),
          }),
        };
      case 'vault_shares':
        return {
          select: () => ({
            or: () => resolveOrError(data.vaultShares, errors.vaultShares),
          }),
        };
      default:
        throw new Error(`Unexpected table in test mock: ${table}`);
    }
  };
  return { from } as unknown as SupabaseClient;
}

const ownedVault: Vault = {
  id: 'vault-1', user_id: 'user-1', name: 'Owned', description: null,
  color: '#fff', visibility: 'private', public_slug: null, category: null,
  abstract: null, created_at: 'now', updated_at: 'now',
};
const sharedVault: Vault = {
  id: 'vault-2', user_id: 'user-2', name: 'Shared', description: null,
  color: '#000', visibility: 'private', public_slug: null, category: null,
  abstract: null, created_at: 'now', updated_at: 'now',
};

describe('fetchUserVaults', () => {
  it('returns empty owned/shared vaults for a user with none', async () => {
    const client = makeClient({});
    const result = await fetchUserVaults(client, 'user-1', 'user@example.com');
    expect(result.ownedVaults).toEqual([]);
    expect(result.sharedVaults).toEqual([]);
    expect(result.scopedVaultIds).toEqual([]);
  });

  it('returns owned vaults without needing a shared-vault-detail lookup', async () => {
    const client = makeClient({ ownedVaults: [ownedVault] });
    const result = await fetchUserVaults(client, 'user-1', 'user@example.com');
    expect(result.ownedVaults).toEqual([ownedVault]);
    expect(result.sharedVaults).toEqual([]);
    expect(result.scopedVaultIds).toEqual(['vault-1']);
  });

  it('resolves shared vault ids into full vault details', async () => {
    const client = makeClient({
      ownedVaults: [ownedVault],
      vaultShares: [{ vault_id: 'vault-2', role: 'viewer' }],
      sharedVaultDetails: [sharedVault],
    });
    const result = await fetchUserVaults(client, 'user-1', 'user@example.com');
    expect(result.sharedVaults).toEqual([sharedVault]);
    expect(result.sharedVaultIds).toEqual(['vault-2']);
    expect(result.scopedVaultIds.sort()).toEqual(['vault-1', 'vault-2']);
    expect(result.sharedVaultRoles).toEqual({ 'vault-2': 'viewer' });
  });

  it('rejects when the owned-vaults query errors', async () => {
    const client = makeClient({ errors: { ownedVaults: { message: 'permission denied' } } });
    await expect(fetchUserVaults(client, 'user-1', 'user@example.com')).rejects.toMatchObject({
      message: 'permission denied',
    });
  });

  it('rejects when the shared-vault-detail lookup errors', async () => {
    const client = makeClient({
      vaultShares: [{ vault_id: 'vault-2' }],
      errors: { sharedVaultDetails: { message: 'network error' } },
    });
    await expect(fetchUserVaults(client, 'user-1', 'user@example.com')).rejects.toMatchObject({
      message: 'network error',
    });
  });
});
