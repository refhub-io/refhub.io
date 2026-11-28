import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Profiler, useEffect, type ReactNode } from 'react';

// Per-table results for a fake Supabase client. get_vault_content assembles its answer from the
// tables it reads, and fails if any of them fails; other tables are plain queries, where every
// builder method chains and the builder resolves to the table's result.
const { results, handleError, signedInUser, auth, requestedTables, pendingTables, rpcCalls, realtime } = vi.hoisted(() => ({
  results: new Map<string, { data: unknown; error: unknown }>(),
  // Tables queried directly, in order; tables that never answer; RPC calls.
  requestedTables: [] as string[],
  pendingTables: new Set<string>(),
  rpcCalls: [] as { fn: string; args: unknown }[],
  // Realtime channels opened, the callbacks they report their status to, and their handlers by table.
  realtime: {
    opened: 0,
    statusCallbacks: [] as ((status: string, err?: unknown) => void)[],
    handlers: {} as Record<string, (payload: unknown) => void>,
  },
  // One object, like the real auth state between token refreshes. Components read auth.user
  // through a store, so auth.set() re-renders only those that call useAuth, as a token refresh
  // re-renders only the auth state's subscribers in the app.
  signedInUser: { id: 'user-1' },
  auth: {
    user: null as { id: string } | null,
    listeners: new Set<() => void>(),
    set(user: { id: string } | null) { this.user = user; this.listeners.forEach((listener) => listener()); },
    subscribe(listener: () => void) { auth.listeners.add(listener); return () => auth.listeners.delete(listener); },
  },
  handleError: vi.fn((_error: unknown, _context: string, _hasData?: boolean) => 'Could not load vault content'),
}));

vi.mock('@/integrations/supabase/client', () => {
  const resultFor = (table: string) =>
    pendingTables.has(table) ? new Promise<never>(() => {}) : Promise.resolve(results.get(table) ?? { data: [], error: null });
  const query = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'in', 'or', 'order', 'range', 'limit']) builder[method] = () => builder;
    builder.single = () => resultFor(table);
    builder.maybeSingle = () => resultFor(table);
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      resultFor(table).then(resolve, reject);
    return builder;
  };
  // The tables get_vault_content reads, by the key it returns each one under.
  const contentTables = {
    vault: 'vaults', vault_publications: 'vault_publications', tags: 'tags', vault_shares: 'vault_shares',
    publication_tags: 'publication_tags', publication_relations: 'publication_relations',
    pdf_assets: 'publication_pdf_assets',
  };
  const getVaultContent = async () => {
    const answers = await Promise.all(Object.values(contentTables).map(resultFor));
    const failed = answers.find((answer) => answer.error);
    if (failed) return { data: null, error: failed.error };
    return { data: Object.fromEntries(Object.keys(contentTables).map((key, i) => [key, answers[i].data])), error: null };
  };
  const channel = {
    on: (_type: string, filter: { table: string }, handler: (payload: unknown) => void) => {
      realtime.handlers[filter.table] = handler;
      return channel;
    },
    subscribe: (callback?: (status: string, err?: unknown) => void) => {
      if (callback) realtime.statusCallbacks.push(callback);
      return channel;
    },
  };
  return {
    supabase: {
      from: (table: string) => {
        if (Object.values(contentTables).includes(table)) throw new Error(`selected ${table} directly`);
        requestedTables.push(table);
        return query(table);
      },
      rpc: (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        if (fn !== 'get_vault_content') throw new Error(`unexpected rpc ${fn}`);
        return getVaultContent();
      },
      channel: () => { realtime.opened += 1; return channel; },
      removeChannel: () => {},
    },
  };
});
vi.mock('@/hooks/useAuth', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useAuth: () => ({ user: useSyncExternalStore(auth.subscribe, () => auth.user) }) };
});
vi.mock('@/lib/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/toast')>()),
  handleError,
}));

import { VaultContentProvider, useVaultContent, useVaultContentActions } from './VaultContentContext';
import { clearAllPageCaches, getPageCache, hasPageCache } from '@/lib/pageCache';
import { ownerTag } from '@/lib/cacheOwner';
import type { Publication } from '@/types/database';

const paperFromRealtime = { id: 'vp-2', title: 'Added by realtime' } as unknown as Publication;

function OpenVault({ vaultId }: { vaultId: string }) {
  const { publications, error, loading, currentVault, pdfAssetsMap } = useVaultContent();
  const { setCurrentVaultId, addPublication, updateCurrentVault, refreshVaultContent } = useVaultContentActions();
  useEffect(() => {
    setCurrentVaultId(vaultId);
  }, [vaultId, setCurrentVaultId]);
  return (
    <>
      <output data-testid="vault">{JSON.stringify({ papers: publications.length, error })}</output>
      <output data-testid="loading">{String(loading)}</output>
      <output data-testid="pdfs">{JSON.stringify(pdfAssetsMap)}</output>
      <button onClick={() => void refreshVaultContent()}>refresh</button>
      <button onClick={() => addPublication(paperFromRealtime)}>add_paper</button>
      <button onClick={() => currentVault && updateCurrentVault({ ...currentVault, name: 'Renamed' })}>rename</button>
    </>
  );
}

const shown = () => JSON.parse(screen.getByTestId('vault').textContent ?? '{}');
const pdfs = () => JSON.parse(screen.getByTestId('pdfs').textContent ?? '{}');

beforeEach(() => {
  clearAllPageCaches();
  handleError.mockClear();
  results.clear();
  requestedTables.length = 0;
  pendingTables.clear();
  rpcCalls.length = 0;
  auth.user = signedInUser;
  realtime.opened = 0;
  realtime.statusCallbacks.length = 0;
  realtime.handlers = {};
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
  it('shows and caches the vault when it loads', async () => {
    render(<VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>);

    await waitFor(() => expect(shown().papers).toBe(1));
    expect(hasPageCache('vault-content-vault-1')).toBe(true);
    expect(handleError).not.toHaveBeenCalled();
  });

  // #253: a failed tag query used to be ignored, so the vault showed, and was cached, untagged.
  // The tag links now come in the same call as everything else, so they fail with it.
  it('reports a failed load as an error and caches nothing, also when only the tag links fail', async () => {
    const tagError = { code: '57014', message: 'canceling statement due to statement timeout' };
    results.set('publication_tags', { data: null, error: tagError });

    render(<VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>);

    await waitFor(() => expect(handleError).toHaveBeenCalledWith(tagError, 'loading vault content', false));
    await waitFor(() => expect(shown().error).toBe('Could not load vault content'));
    expect(shown().papers).toBe(0);
    expect(hasPageCache('vault-content-vault-1')).toBe(false);
  });

  // #256: the catch block read the paper list from a stale closure, still empty after the vault
  // loaded, so a failed refresh replaced the loaded vault with an error screen.
  it('keeps a loaded vault on screen when a later refresh fails', async () => {
    render(<VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>);
    await waitFor(() => expect(shown().papers).toBe(1));

    const tagError = { code: '57014', message: 'canceling statement due to statement timeout' };
    results.set('publication_tags', { data: null, error: tagError });
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => expect(handleError).toHaveBeenCalledWith(tagError, 'loading vault content', true));
    expect(shown()).toEqual({ papers: 1, error: null });
  });

  // #256: renaming the vault wrote the cached arrays back over newer state, so a paper added
  // since the load (by realtime, for example) dropped out of the cache.
  it('caches the current papers, not older cached ones, when the vault is renamed', async () => {
    render(<VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>);
    await waitFor(() => expect(shown().papers).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: 'add_paper' }));
    await waitFor(() => expect(shown().papers).toBe(2));
    fireEvent.click(screen.getByRole('button', { name: 'rename' }));

    const cached = getPageCache<{ currentVault: { name: string }; publications: unknown[] }>('vault-content-vault-1', ownerTag('user-1'));
    expect(cached?.currentVault.name).toBe('Renamed');
    expect(cached?.publications).toHaveLength(2);
  });

  // #258: an access check of its own, then two dependent batches of selects, then a third for
  // stored PDFs. The mock throws on a direct select of any of the vault's tables, the access
  // check's included.
  it('loads the vault in one call, without selecting its tables or checking access itself', async () => {
    render(<VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>);
    await waitFor(() => expect(shown().papers).toBe(1));

    expect(rpcCalls).toEqual([{ fn: 'get_vault_content', args: { p_vault_id: 'vault-1' } }]);
    expect(requestedTables).toEqual([]);
    expect(handleError).not.toHaveBeenCalled();
  });

  // Without an access check to wait for, every new user object started another fetch: the auth
  // state hands one over on each token refresh, and several while a session restores.
  it('loads once while the session restores, and not again on a token refresh', async () => {
    const tree = () => <VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>;
    auth.user = null;
    const view = render(tree());
    auth.user = { id: 'user-1' };
    view.rerender(tree());
    await waitFor(() => expect(shown().papers).toBe(1));

    auth.user = { id: 'user-1' };
    view.rerender(tree());
    auth.user = { id: 'user-1' };
    view.rerender(tree());

    expect(rpcCalls).toHaveLength(1);
  });

  // The channel depended on the user object, which the auth state replaces on every token
  // refresh: it was torn down and opened again, and changes in between never arrived.
  it('keeps its realtime channel through a token refresh', async () => {
    const tree = () => <VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>;
    const view = render(tree());
    await waitFor(() => expect(shown().papers).toBe(1));
    const opened = realtime.opened;

    auth.user = { id: 'user-1' };
    view.rerender(tree());

    expect(realtime.opened).toBe(opened);
  });

  // Changes made while the channel is down are never delivered.
  it('fetches the vault again when its realtime channel re-joins after a drop', async () => {
    render(<VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>);
    await waitFor(() => expect(shown().papers).toBe(1));
    const report = realtime.statusCallbacks.at(-1)!;

    act(() => report('SUBSCRIBED'));
    expect(rpcCalls).toHaveLength(1);

    act(() => { report('CHANNEL_ERROR'); report('SUBSCRIBED'); });
    await waitFor(() => expect(rpcCalls).toHaveLength(2));
  });

  // Row-level security hides a vault the user can't read: the call answers with no vault.
  it('clears a vault the user can no longer read, without an error, and drops its cache', async () => {
    render(<VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>);
    await waitFor(() => expect(shown().papers).toBe(1));
    expect(hasPageCache('vault-content-vault-1')).toBe(true);

    results.set('vaults', { data: null, error: null });
    results.set('vault_publications', { data: [], error: null });
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => expect(shown().papers).toBe(0));
    expect(shown().error).toBeNull();
    expect(hasPageCache('vault-content-vault-1')).toBe(false);
    expect(handleError).not.toHaveBeenCalled();
  });

  it('has the stored PDF links with the papers, and restores them from the cache on a revisit', async () => {
    results.set('publication_pdf_assets', {
      data: [{ publication_id: 'p-1', vault_publication_id: null, stored_pdf_url: 'https://drive.example/a' }],
      error: null,
    });
    const first = render(<VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>);
    await waitFor(() => expect(shown().papers).toBe(1));
    expect(pdfs()).toEqual({ 'vp-1': 'https://drive.example/a' });
    first.unmount();

    // Back again while the refresh is still on its way: the cached links show at once.
    pendingTables.add('vaults');
    render(<VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>);
    await waitFor(() => expect(shown().papers).toBe(1));
    expect(pdfs()).toEqual({ 'vp-1': 'https://drive.example/a' });
  });

  it("shows the vault without waiting for the last update's author name", async () => {
    const [paper] = results.get('vault_publications')!.data as Record<string, unknown>[];
    results.set('vault_publications', { data: [{ ...paper, updated_by: 'user-2' }], error: null });
    pendingTables.add('profiles');

    render(<VaultContentProvider><OpenVault vaultId="vault-1" /></VaultContentProvider>);

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(shown().papers).toBe(1);
  });
});

// Stand-ins for the vault page, which shows content and acts on it, and for a component that only
// acts. Each counts its commits through React's Profiler.
const commits = { page: 0, actionsOnly: 0 };
function PageProbe({ vaultId }: { vaultId: string }) {
  const { publications } = useVaultContent();
  const { setCurrentVaultId } = useVaultContentActions();
  useEffect(() => {
    setCurrentVaultId(vaultId);
  }, [vaultId, setCurrentVaultId]);
  return <output data-testid="probe">{publications.map((pub) => pub.title).join(' | ')}</output>;
}
function ActionsProbe() {
  useVaultContentActions();
  return null;
}
const profiled = (id: keyof typeof commits, node: ReactNode) => (
  <Profiler id={id} onRender={() => { commits[id] += 1; }}>{node}</Profiler>
);

describe('VaultContentContext re-renders', () => {
  // The value used to be one object, rebuilt on every render of the provider, so the vault page
  // re-rendered for anything: a token refresh, the realtime connection coming up, a share.
  it('re-renders the vault page only for content it shows, and an actions-only component never', async () => {
    commits.page = 0;
    commits.actionsOnly = 0;
    render(
      <VaultContentProvider>
        {profiled('page', <PageProbe vaultId="vault-1" />)}
        {profiled('actionsOnly', <ActionsProbe />)}
      </VaultContentProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('A paper'));
    await act(async () => {});
    const loaded = { ...commits };

    act(() => { auth.set({ id: 'user-1' }); }); // a token refresh: a new user object, the same user
    act(() => { realtime.statusCallbacks.at(-1)!('SUBSCRIBED'); });
    await act(async () => {
      await realtime.handlers.vault_shares({ eventType: 'INSERT', new: { id: 'share-1', vault_id: 'vault-1' }, old: {} });
    });
    expect(commits).toEqual(loaded);

    await act(async () => {
      await realtime.handlers.vault_publications({ eventType: 'UPDATE', new: { id: 'vp-1', title: 'Renamed live' }, old: {} });
    });
    expect(screen.getByTestId('probe').textContent).toBe('Renamed live');
    expect(commits.page).toBeGreaterThan(loaded.page);
    expect(commits.actionsOnly).toBe(loaded.actionsOnly);
  });
});
