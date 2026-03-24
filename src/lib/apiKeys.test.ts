import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiKeyManagementUnavailableError,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from './apiKeys';

describe('apiKeys', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists keys from the default same-origin route', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        api_keys: [
          {
            id: 'key-1',
            label: 'sync-bot',
            description: 'sync',
            key_prefix: 'rhk_public',
            scopes: ['vaults:read'],
            created_at: '2026-03-24T07:00:00Z',
            vault_ids: ['vault-1'],
          },
        ],
      }),
    } as Response);

    const keys = await listApiKeys('token');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/keys',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
    expect(keys).toEqual([
      expect.objectContaining({
        id: 'key-1',
        keyPrefix: 'rhk_public',
        vaultIds: ['vault-1'],
      }),
    ]);
  });

  it('creates a key from an enveloped backend response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 'key-2',
          label: 'export-job',
          description: null,
          key_prefix: 'rhk_export',
          scopes: ['vaults:export'],
          created_at: '2026-03-24T07:10:00Z',
          vault_ids: [],
        },
        secret: 'rhk_export_secret',
      }),
    } as Response);

    const result = await createApiKey('token', {
      label: 'export-job',
      scopes: ['vaults:export'],
      description: '',
      vaultIds: [],
    });

    expect(result.secret).toBe('rhk_export_secret');
    expect(result.key.keyPrefix).toBe('rhk_export');
  });

  it('falls back to DELETE when revoke endpoint does not support POST /revoke', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 405,
        json: async () => ({ message: 'Method not allowed' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: 'key-3',
            label: 'writer',
            description: null,
            key_prefix: 'rhk_writer',
            scopes: ['vaults:write'],
            created_at: '2026-03-24T07:15:00Z',
            revoked_at: '2026-03-24T07:20:00Z',
            vault_ids: [],
          },
        }),
      } as Response);

    const result = await revokeApiKey('token', 'key-3');

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/keys/key-3/revoke',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/keys/key-3',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(result.revokedAt).toBe('2026-03-24T07:20:00Z');
  });

  it('surfaces a missing route as unavailable', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not found' }),
    } as Response);

    await expect(listApiKeys('token')).rejects.toBeInstanceOf(ApiKeyManagementUnavailableError);
  });
});
