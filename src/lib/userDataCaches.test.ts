import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));

import { del, get, set } from 'idb-keyval';
import { hasPageCache, setPageCache } from './pageCache';
import { getCacheOwner, readStoredSessionUserId } from './cacheOwner';
import { initQueryPersistence, queryClient } from './queryClient';
import { syncCacheOwner } from './userDataCaches';

/** A persisted copy holding one query, as React Query would have saved it for `owner`. */
function persistedFor(owner: string, vaults: string[]): PersistedClient {
  const source = new QueryClient();
  source.setQueryData(['vaults'], vaults);
  return { buster: owner, timestamp: Date.now(), clientState: dehydrate(source) };
}

const lastPersisted = () => vi.mocked(set).mock.calls.at(-1)?.[1] as PersistedClient | undefined;

beforeEach(() => {
  localStorage.clear();
  queryClient.clear();
  vi.mocked(get).mockReset().mockResolvedValue(undefined);
  vi.mocked(set).mockReset().mockResolvedValue(undefined);
  vi.mocked(del).mockReset().mockResolvedValue(undefined);
});

describe('syncCacheOwner', () => {
  beforeEach(async () => {
    await syncCacheOwner('user-a');
    vi.mocked(del).mockClear();
    setPageCache('dashboard', { papers: 3 });
    queryClient.setQueryData(['vaults'], ['a-vault']);
  });

  it('keeps caches while the same user stays signed in', async () => {
    await syncCacheOwner('user-a');
    expect(hasPageCache('dashboard')).toBe(true);
    expect(queryClient.getQueryData(['vaults'])).toEqual(['a-vault']);
    expect(del).not.toHaveBeenCalled();
  });

  it('clears every cache, IndexedDB copy included, when a different user signs in', async () => {
    await syncCacheOwner('user-b');
    expect(hasPageCache('dashboard')).toBe(false);
    expect(queryClient.getQueryData(['vaults'])).toBeUndefined();
    expect(del).toHaveBeenCalledWith('refhub-query-cache');
    expect(getCacheOwner()).toBe('user-b');
  });

  it('clears every cache on sign-out', async () => {
    await syncCacheOwner(null);
    expect(hasPageCache('dashboard')).toBe(false);
    expect(del).toHaveBeenCalledWith('refhub-query-cache');
    expect(getCacheOwner()).toBeNull();
  });

  it('clears this tab even when another tab has already handled the same switch', async () => {
    // Tabs share localStorage but not caches. The first version kept the owner there, so a
    // switch made in another tab looked handled here and this tab kept the previous user's data.
    localStorage.setItem('refhub_cache_owner', 'user-b');
    await syncCacheOwner('user-b');
    expect(queryClient.getQueryData(['vaults'])).toBeUndefined();
  });
});

describe('the persisted copy', () => {
  it('is tagged with the user whose data it is, when it is written', async () => {
    await syncCacheOwner('user-a');
    const [unsubscribe, restored] = initQueryPersistence();
    await restored;

    queryClient.setQueryData(['vaults'], ['a-vault']);
    await vi.waitFor(() => expect(lastPersisted()?.buster).toBe('user-a'));

    await syncCacheOwner('user-b');
    queryClient.setQueryData(['vaults'], ['b-vault']);
    await vi.waitFor(() => expect(JSON.stringify(lastPersisted()?.clientState)).toContain('b-vault'));
    expect(lastPersisted()?.buster).toBe('user-b');
    expect(JSON.stringify(lastPersisted()?.clientState)).not.toContain('a-vault');
    unsubscribe();
  });

  it('is restored for the user it was saved for', async () => {
    await syncCacheOwner('user-a');
    vi.mocked(get).mockResolvedValue(persistedFor('user-a', ['a-vault']));
    const [unsubscribe, restored] = initQueryPersistence();
    await restored;

    expect(queryClient.getQueryData(['vaults'])).toEqual(['a-vault']);
    unsubscribe();
  });

  it('is discarded when it was saved for someone else', async () => {
    await syncCacheOwner('user-b');
    vi.mocked(get).mockResolvedValue(persistedFor('user-a', ['a-vault']));
    const [unsubscribe, restored] = initQueryPersistence();
    await restored;

    expect(queryClient.getQueryData(['vaults'])).toBeUndefined();
    expect(del).toHaveBeenCalledWith('refhub-query-cache');
    unsubscribe();
  });

  it('is not restored if the user changes while it is being read', async () => {
    await syncCacheOwner('user-a');
    let finishRead: (value: PersistedClient) => void = () => {};
    vi.mocked(get).mockReturnValue(new Promise<PersistedClient>((resolve) => { finishRead = resolve; }));
    const [unsubscribe, restored] = initQueryPersistence();

    await syncCacheOwner('user-b');
    finishRead(persistedFor('user-a', ['a-vault']));
    await restored;

    expect(queryClient.getQueryData(['vaults'])).toBeUndefined();
    unsubscribe();
  });
});

describe('readStoredSessionUserId', () => {
  it('reads the user id from the stored Supabase session', () => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'x', user: { id: 'user-a' } }));
    expect(readStoredSessionUserId()).toBe('user-a');
  });

  it('returns null with no session, or an unreadable one', () => {
    expect(readStoredSessionUserId()).toBeNull();
    localStorage.setItem('sb-127-auth-token', '{not json');
    expect(readStoredSessionUserId()).toBeNull();
  });
});
