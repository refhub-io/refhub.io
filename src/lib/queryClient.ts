import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';

/**
 * Custom IndexedDB persister for React Query
 * Uses idb-keyval for simple key-value storage in IndexedDB
 */
const createIDBPersister = (idbValidKey: IDBValidKey = 'refhub-query-cache') => ({
  persistClient: async (client: Parameters<typeof persistQueryClient>[0]['persister']['persistClient'][0]) => {
    try {
      await set(idbValidKey, client);
    } catch (error) {
      console.warn('[QueryClient] Failed to persist cache:', error);
    }
  },
  restoreClient: async () => {
    try {
      return await get<Parameters<typeof persistQueryClient>[0]['persister']['restoreClient'] extends () => Promise<infer T> ? T : never>(idbValidKey);
    } catch (error) {
      console.warn('[QueryClient] Failed to restore cache:', error);
      return undefined;
    }
  },
  removeClient: async () => {
    try {
      await del(idbValidKey);
    } catch (error) {
      console.warn('[QueryClient] Failed to remove cache:', error);
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
export const initQueryPersistence = () => {
  const persister = createIDBPersister();
  
  persistQueryClient({
    queryClient,
    persister,
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

export default queryClient;
