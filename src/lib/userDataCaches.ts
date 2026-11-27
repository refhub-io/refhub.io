import { clearAllPageCaches } from '@/lib/pageCache';
import { queryClient, removePersistedQueryCache } from '@/lib/queryClient';

/** The user whose data is in the caches right now, kept across reloads. */
const CACHE_OWNER_KEY = 'refhub_cache_owner';

/**
 * Drops every client-side copy of user data: the in-memory page cache, React Query's cache and
 * its IndexedDB copy, which survives reloads for 24 hours.
 */
export async function clearUserDataCaches(): Promise<void> {
  clearAllPageCaches();
  queryClient.clear();
  await removePersistedQueryCache();
}

/**
 * Runs on every auth state change. Caches belong to the user who filled them, so when the
 * session ends, or a different user's session appears, they're cleared before anything reads
 * them. Nothing happens while the same user stays signed in (token refreshes, reloads).
 */
export async function syncCacheOwner(userId: string | null): Promise<void> {
  const owner = localStorage.getItem(CACHE_OWNER_KEY);
  if (userId === owner) return;
  await clearUserDataCaches();
  if (userId) localStorage.setItem(CACHE_OWNER_KEY, userId);
  else localStorage.removeItem(CACHE_OWNER_KEY);
}
