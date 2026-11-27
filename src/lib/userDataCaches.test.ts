import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn().mockResolvedValue(undefined) }));

import { del } from 'idb-keyval';
import { hasPageCache, setPageCache } from './pageCache';
import { queryClient, readStoredSessionUserId } from './queryClient';
import { syncCacheOwner } from './userDataCaches';

describe('syncCacheOwner', () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    vi.mocked(del).mockClear();
    setPageCache('dashboard', { papers: 3 });
    queryClient.setQueryData(['vaults', 'user-a'], ['vault-1']);
  });

  it('keeps caches while the same user stays signed in', async () => {
    localStorage.setItem('refhub_cache_owner', 'user-a');
    await syncCacheOwner('user-a');
    expect(hasPageCache('dashboard')).toBe(true);
    expect(queryClient.getQueryData(['vaults', 'user-a'])).toEqual(['vault-1']);
    expect(del).not.toHaveBeenCalled();
  });

  it('clears every cache, IndexedDB copy included, when a different user signs in', async () => {
    localStorage.setItem('refhub_cache_owner', 'user-a');
    await syncCacheOwner('user-b');
    expect(hasPageCache('dashboard')).toBe(false);
    expect(queryClient.getQueryData(['vaults', 'user-a'])).toBeUndefined();
    expect(del).toHaveBeenCalledWith('refhub-query-cache');
    expect(localStorage.getItem('refhub_cache_owner')).toBe('user-b');
  });

  it('clears every cache on sign-out and forgets the owner', async () => {
    localStorage.setItem('refhub_cache_owner', 'user-a');
    await syncCacheOwner(null);
    expect(hasPageCache('dashboard')).toBe(false);
    expect(del).toHaveBeenCalledWith('refhub-query-cache');
    expect(localStorage.getItem('refhub_cache_owner')).toBeNull();
  });
});

describe('readStoredSessionUserId', () => {
  beforeEach(() => localStorage.clear());

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
