/**
 * The signed-in user whose data this tab holds. It starts as the user in the stored session and
 * follows the auth events from then on (see syncCacheOwner).
 *
 * It's kept in memory, not localStorage, because every tab has its own caches and component
 * state. A marker shared between tabs would let one tab treat a user switch made in another tab
 * as already handled, and keep showing the previous user's data.
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

let cacheOwner: string | null = readStoredSessionUserId();
const changeListeners = new Set<() => void>();

export const getCacheOwner = (): string | null => cacheOwner;

export function setCacheOwner(userId: string | null): void {
  if (userId === cacheOwner) return;
  cacheOwner = userId;
  changeListeners.forEach((listener) => listener());
}

/** Calls `listener` whenever this tab's user changes: sign-in, sign-out, or a switch made in another tab. */
export function onCacheOwnerChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}
