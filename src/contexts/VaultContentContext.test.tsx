import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';

// Per-table results for a fake Supabase client: every query builder method chains, and the
// builder resolves to the table's result whether it's awaited, paged or asked for .single().
const { results, handleError, signedInUser } = vi.hoisted(() => ({
  results: new Map<string, { data: unknown; error: unknown }>(),
  // One object, like the real auth state: the provider's fetch effect depends on it.
  signedInUser: { id: 'user-1' },
  handleError: vi.fn((_error: unknown, _context: string, _hasData?: boolean) => 'Could not load vault content'),
}));

vi.mock('@/integrations/supabase/client', () => {
  const resultFor = (table: string) => results.get(table) ?? { data: [], error: null };
  const query = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'in', 'or', 'order', 'range', 'limit']) builder[method] = () => builder;
    builder.single = () => Promise.resolve(resultFor(table));
    builder.maybeSingle = () => Promise.resolve(resultFor(table));
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(resultFor(table)).then(resolve, reject);
    return builder;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { from: query, channel: () => channel, removeChannel: () => {} } };
});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: signedInUser }) }));
vi.mock('@/hooks/useVaultAccess', () => ({ useVaultAccess: () => ({ canView: true }) }));
vi.mock('@/lib/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/toast')>()),
  handleError,
}));

import { VaultContentProvider, useVaultContent } from './VaultContentContext';
import { clearAllPageCaches, hasPageCache } from '@/lib/pageCache';

function OpenVault({ vaultId }: { vaultId: string }) {
  const { setCurrentVaultId, publications, error } = useVaultContent();
  useEffect(() => {
    setCurrentVaultId(vaultId);
  }, [vaultId, setCurrentVaultId]);
  return <output data-testid="vault">{JSON.stringify({ papers: publications.length, error })}</output>;
}

const shown = () => JSON.parse(screen.getByTestId('vault').textContent ?? '{}');

beforeEach(() => {
  clearAllPageCaches();
  handleError.mockClear();
  results.clear();
  results.set('vault_publications', {
    data: [{
      id: 'vp-1', vault_id: 'vault-1', original_publication_id: 'p-1', title: 'A paper', authors: ['Ada Lovelace'],
      created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', updated_by: null,
    }],
    error: null,
  });
  results.set('vaults', { data: { id: 'vault-1', name: 'A vault', user_id: 'user-1' }, error: null });
});

describe('VaultContentContext loading a vault', () => {
  it('shows and caches the vault when every query succeeds', async () => {
    render(<VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>);

    await waitFor(() => expect(shown().papers).toBe(1));
    expect(hasPageCache('vault-content-vault-1')).toBe(true);
    expect(handleError).not.toHaveBeenCalled();
  });

  // #253: a failed tag query used to be ignored, so the vault showed, and was cached, untagged.
  it('reports a failed publication_tags query as an error and caches nothing', async () => {
    const tagError = { code: '57014', message: 'canceling statement due to statement timeout' };
    results.set('publication_tags', { data: null, error: tagError });

    render(<VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>);

    await waitFor(() => expect(handleError).toHaveBeenCalledWith(tagError, 'loading vault content', false));
    await waitFor(() => expect(shown().error).toBe('Could not load vault content'));
    expect(shown().papers).toBe(0);
    expect(hasPageCache('vault-content-vault-1')).toBe(false);
  });
});
