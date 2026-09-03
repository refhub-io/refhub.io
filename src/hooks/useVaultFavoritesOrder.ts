import { useCallback, useEffect, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { logger } from '@/lib/logger';
import { Vault } from '@/types/database';
import { applyVaultOrder } from '@/lib/vaultSidebarDnd';

const STORAGE_KEY_PREFIX = 'refhub_vault_favorites_order_v1';

export function getVaultFavoritesOrderStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function readStoredOrder(userId: string | null | undefined): string[] {
  if (!userId || typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(getVaultFavoritesOrderStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch (error) {
    logger.error('useVaultFavoritesOrder', 'Error loading vault favorites order from localStorage:', error);
    return [];
  }
}

function persistOrder(userId: string, orderedIds: string[]) {
  try {
    localStorage.setItem(getVaultFavoritesOrderStorageKey(userId), JSON.stringify(orderedIds));
  } catch (error) {
    logger.error('useVaultFavoritesOrder', 'Error saving vault favorites order to localStorage:', error);
  }
}

/**
 * Persists a user-local custom order for the sidebar's "favorites" list.
 * Mirrors useVaultSidebarOrder but under its own storage key, so reordering
 * favorites never touches the separate "my vaults" order.
 */
export function useVaultFavoritesOrder(userId: string | null | undefined) {
  const [orderedIds, setOrderedIds] = useState<string[]>(() => readStoredOrder(userId));

  // See useVaultSidebarOrder for why this is needed: userId is frequently
  // undefined on first render (auth resolves async), and the lazy useState
  // initializer only runs once, so without this a saved order silently
  // never applies for the rest of this mount.
  useEffect(() => {
    setOrderedIds(readStoredOrder(userId));
  }, [userId]);

  const orderFavorites = useCallback((vaults: Vault[]) => applyVaultOrder(vaults, orderedIds), [orderedIds]);

  const reorder = useCallback((vaults: Vault[], activeId: string, overId: string) => {
    if (!userId || activeId === overId) return;

    const currentOrder = applyVaultOrder(vaults, orderedIds).map((vault) => vault.id);
    const from = currentOrder.indexOf(activeId);
    const to = currentOrder.indexOf(overId);
    if (from === -1 || to === -1) return;

    const next = arrayMove(currentOrder, from, to);
    setOrderedIds(next);
    persistOrder(userId, next);
  }, [orderedIds, userId]);

  return { orderFavorites, reorder };
}
