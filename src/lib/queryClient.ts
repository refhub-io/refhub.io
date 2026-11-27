import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';
import { warn } from '@/lib/logger';

/**
 * Custom IndexedDB persister for React Query
 * Uses idb-keyval for simple key-value storage in IndexedDB
 */
const PERSISTED_CACHE_KEY = 'refhub-query-cache';

const createIDBPersister = (idbValidKey: IDBValidKey = PERSISTED_CACHE_KEY) => ({
  persistClient: async (client: Parameters<Parameters<typeof persistQueryClient>[0]['persister']['persistClient']>[0]) => {
    try {
      await set(idbValidKey, client);
    } catch (error) {
      warn('QueryClient', 'Failed to persist cache:', error);
    }
  },
  restoreClient: async () => {
    try {
      return await get<Parameters<typeof persistQueryClient>[0]['persister']['restoreClient'] extends () => Promise<infer T> ? T : never>(idbValidKey);
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

/**
 * Initialize query persistence to IndexedDB
 * Call this once at app startup
 */
/**
 * The user id in the Supabase session stored in localStorage, read synchronously, so it's known
 * before auth finishes loading. Null when nobody is signed in.
 */
export function readStoredSessionUserId(): string | null {
  try {
    // The Storage API rather than Object.keys(localStorage), which not every implementation enumerates.
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '');
    const key = keys.find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    return JSON.parse(localStorage.getItem(key) ?? 'null')?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Removes React Query's IndexedDB copy, so a later page load can't restore it. */
export async function removePersistedQueryCache(): Promise<void> {
  try {
    await del(PERSISTED_CACHE_KEY);
  } catch (error) {
    warn('QueryClient', 'Failed to remove persisted cache:', error);
  }
}

export const initQueryPersistence = () => {
  const persister = createIDBPersister();

  persistQueryClient({
    queryClient,
    persister,
    // The persisted cache is only restored for the user who saved it: a copy saved under another
    // user, or with nobody signed in, is discarded instead of shown to whoever signs in next.
    buster: readStoredSessionUserId() ?? 'signed-out',
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

