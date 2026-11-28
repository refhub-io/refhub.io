import { clearAllPageCaches } from '@/lib/pageCache';
import { getCacheOwner, setCacheOwner } from '@/lib/cacheOwner';
import { queryClient, removePersistedQueryCache } from '@/lib/queryClient';

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
  if (userId === getCacheOwner()) return;
  // Changed first, so anything persisted from here on is tagged with the new owner.
  setCacheOwner(userId);
  await clearUserDataCaches();
}
