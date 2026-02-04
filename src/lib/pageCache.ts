/**
 * Simple in-memory page cache to prevent refetching when navigating between routes.
 * 
 * Usage:
 * 1. On page mount, check if cache has data: pageCache.get('dashboard')
 * 2. If data exists, show it immediately (skip loading screen)
 * 3. Fetch fresh data in background and update cache: pageCache.set('dashboard', data)
 * 4. Only show loading screen if cache is empty (first visit)
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  userId?: string;
}

type CacheKey = 'dashboard' | 'codex' | 'users' | 'sidebar-vaults' | `vault-access-${string}` | `vault-content-${string}`;

// Cache storage - persists across route changes but not page refreshes
const cache = new Map<string, CacheEntry<any>>();

// Default cache TTL: 5 minutes (after which we still show cached data but mark it stale)
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Get cached data for a page
 * @param key - Cache key for the page
 * @param userId - Optional user ID to ensure cache belongs to current user
 * @returns Cached data or null if not found/expired/wrong user
 */
export function getPageCache<T>(key: CacheKey, userId?: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  
  if (!entry) return null;
  
  // If userId is provided, check it matches
  if (userId && entry.userId && entry.userId !== userId) {
    // Cache belongs to different user, clear it
    cache.delete(key);
    return null;
  }
  
  return entry.data;
}

/**
 * Check if cached data is stale (older than TTL)
 */
export function isCacheStale(key: CacheKey): boolean {
  const entry = cache.get(key);
  if (!entry) return true;
  return Date.now() - entry.timestamp > CACHE_TTL;
}

/**
 * Set cached data for a page
 * @param key - Cache key for the page
 * @param data - Data to cache
 * @param userId - Optional user ID to associate with cache
 */
export function setPageCache<T>(key: CacheKey, data: T, userId?: string): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    userId,
  });
}

/**
 * Clear cache for a specific key
 */
export function clearPageCache(key: CacheKey): void {
  cache.delete(key);
}

/**
 * Clear all page caches (e.g., on logout)
 */
export function clearAllPageCaches(): void {
  cache.clear();
}

/**
 * Check if cache exists for a key
 */
export function hasPageCache(key: CacheKey): boolean {
  return cache.has(key);
}
