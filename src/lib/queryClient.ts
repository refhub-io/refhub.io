import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient, type PersistedClient } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';
import { warn } from '@/lib/logger';
import { getCacheOwner, ownerTag } from '@/lib/cacheOwner';

const PERSISTED_CACHE_KEY = 'refhub-query-cache';

/**
 * Custom IndexedDB persister for React Query
 * Uses idb-keyval for simple key-value storage in IndexedDB
 */
const createIDBPersister = (canRestore: () => boolean, idbValidKey: IDBValidKey = PERSISTED_CACHE_KEY) => ({
  persistClient: async (client: PersistedClient) => {
    try {
      // Tagged with the user whose data it is at the moment it's written.
      await set(idbValidKey, { ...client, buster: ownerTag(getCacheOwner()) });
    } catch (error) {
      warn('QueryClient', 'Failed to persist cache:', error);
    }
  },
  restoreClient: async () => {
    try {
      const restored = await get<PersistedClient>(idbValidKey);
      // React Query hydrates in the same task this returns in, so no auth event can change the
      // owner between this check and the hydrate.
      return canRestore() ? restored : undefined;
    } catch (error) {
      warn('QueryClient', 'Failed to restore cache:', error);
      return undefined;
    }
  },
  removeClient: async () => {
    try {
      await del(idbValidKey);
    } catch (error) {
      warn('QueryClient', 'Failed to remove cache:', error);
    }
  },
});

/**
 * Query client with optimized defaults for reduced refetching
 * and better offline/idle experience
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch when window regains focus - prevents idle refetch errors
      refetchOnWindowFocus: false,
      // Don't refetch when reconnecting - we use stale data and background refresh
      refetchOnReconnect: false,
      // Retry failed queries once before showing error
      retry: 1,
      // Data stays fresh for 5 minutes before being marked stale
      staleTime: 5 * 60 * 1000,
      // Keep unused data in cache for 30 minutes
      gcTime: 30 * 60 * 1000,
      // On error, keep previous data visible instead of showing error state
      placeholderData: (previousData: unknown) => previousData,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
});

/** Removes React Query's IndexedDB copy, so a later page load can't restore it. */
export async function removePersistedQueryCache(): Promise<void> {
  try {
    await del(PERSISTED_CACHE_KEY);
  } catch (error) {
    warn('QueryClient', 'Failed to remove persisted cache:', error);
  }
}

/**
 * Initialize query persistence to IndexedDB
 * Call this once at app startup
 */
export const initQueryPersistence = () => {
  // The persisted copy is restored only if it was saved for the user who owns this tab's caches
  // now, and only if they still do when the read finishes: a sign-out or switch while it's being
  // read discards it.
  const owner = getCacheOwner();
  const persister = createIDBPersister(() => getCacheOwner() === owner);

  return persistQueryClient({
    queryClient,
    persister,
    buster: ownerTag(owner),
    // Max age of persisted cache: 24 hours
    maxAge: 24 * 60 * 60 * 1000,
    // Dehydrate options - what to persist
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => {
        // Only persist successful queries with data
        return query.state.status === 'success' && query.state.data !== undefined;
      },
    },
  });
};

