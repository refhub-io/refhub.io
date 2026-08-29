import { useCallback, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { logger } from '@/lib/logger';
import { Vault } from '@/types/database';
import { applyVaultOrder } from '@/lib/vaultSidebarDnd';

const STORAGE_KEY_PREFIX = 'refhub_vault_sidebar_order_v1';

export function getVaultSidebarOrderStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function readStoredOrder(userId: string | null | undefined): string[] {
  if (!userId || typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(getVaultSidebarOrderStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch (error) {
    logger.error('useVaultSidebarOrder', 'Error loading vault sidebar order from localStorage:', error);
    return [];
  }
}

function persistOrder(userId: string, orderedIds: string[]) {
  try {
    localStorage.setItem(getVaultSidebarOrderStorageKey(userId), JSON.stringify(orderedIds));
  } catch (error) {
    logger.error('useVaultSidebarOrder', 'Error saving vault sidebar order to localStorage:', error);
  }
}

/**
 * Persists a user-local custom order for the "my vaults" sidebar list.
 * Stored per-user in localStorage (device-local, matches the pattern used
 * by view settings / onboarding — this is a display preference, not vault
 * metadata, so it deliberately does not sync across devices or affect
 * other collaborators).
 */
export function useVaultSidebarOrder(userId: string | null | undefined) {
  const [orderedIds, setOrderedIds] = useState<string[]>(() => readStoredOrder(userId));

  const orderVaults = useCallback((vaults: Vault[]) => applyVaultOrder(vaults, orderedIds), [orderedIds]);

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

  return { orderVaults, reorder };
}
