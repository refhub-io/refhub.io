import { useCallback, useMemo, useState } from 'react';
import {
  DragEndEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Vault } from '@/types/database';
import { VaultRole } from '@/types/vault-extensions';
import { useVaultSidebarOrder } from '@/hooks/useVaultSidebarOrder';
import { useVaultSharedOrder } from '@/hooks/useVaultSharedOrder';
import { getDroppableVaultIds, resolveVaultDragEndAction } from '@/lib/vaultSidebarDnd';

interface UseVaultDragAndDropOptions {
  userId: string | null | undefined;
  ownedVaults: Vault[];
  /** Vaults shared with the current user — omit on pages that don't show a
   * "shared with me" list; reordering it then simply has nothing to do. */
  sharedVaults?: Vault[];
  /** Role the current user holds on each shared (non-owned) vault, by vault id. */
  sharedVaultRoles?: Record<string, VaultRole>;
  /** Omit on pages with no draggable publication list (e.g. Codex, researcher
   * profiles) — vault-list reordering still works, "add to vault" just never
   * fires since there's nothing publication-typed to drag in that context. */
  onAddPublicationsToVault?: (publicationIds: string[], vaultId: string) => Promise<void>;
}

export interface ActiveVaultDrag {
  type: 'publication' | 'vault';
  publicationCount?: number;
  vault?: Vault;
}

type DragItemData = { type?: 'publication' | 'vault' | 'shared'; publicationIds?: string[] };

export function useVaultDragAndDrop({
  userId,
  ownedVaults,
  sharedVaults = [],
  sharedVaultRoles = {},
  onAddPublicationsToVault,
}: UseVaultDragAndDropOptions) {
  const { orderVaults, reorder } = useVaultSidebarOrder(userId);
  const { orderShared, reorder: reorderShared } = useVaultSharedOrder(userId);
  const [activeDrag, setActiveDrag] = useState<ActiveVaultDrag | null>(null);

  const orderedOwnedVaults = useMemo(() => orderVaults(ownedVaults), [orderVaults, ownedVaults]);
  const orderedSharedVaults = useMemo(() => orderShared(sharedVaults), [orderShared, sharedVaults]);

  const droppableVaultIds = useMemo(
    () => getDroppableVaultIds(ownedVaults.map((vault) => vault.id), sharedVaultRoles),
    [ownedVaults, sharedVaultRoles],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allVaultsById = useMemo(() => {
    const map = new Map<string, Vault>();
    for (const vault of ownedVaults) map.set(vault.id, vault);
    for (const vault of sharedVaults) map.set(vault.id, vault);
    return map;
  }, [ownedVaults, sharedVaults]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragItemData | undefined;
    if (!data?.type) {
      setActiveDrag(null);
      return;
    }
    if (data.type === 'publication') {
      setActiveDrag({ type: 'publication', publicationCount: data.publicationIds?.length ?? 1 });
    } else {
      setActiveDrag({ type: 'vault', vault: allVaultsById.get(String(event.active.id)) });
    }
  }, [allVaultsById]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDrag(null);

    const action = resolveVaultDragEndAction({
      active: {
        id: String(event.active.id),
        data: event.active.data.current as DragItemData | undefined ?? {},
      },
      over: event.over
        ? { id: String(event.over.id), data: event.over.data.current as DragItemData | undefined ?? {} }
        : null,
    });

    if (action.type === 'add-to-vault') {
      // Shared rows stay droppable at the dnd-kit level regardless of role
      // (see SortableVaultRow) so they remain valid reorder targets — the
      // edit-permission check for actually accepting a paper happens here.
      if (!droppableVaultIds.has(action.vaultId)) return;
      onAddPublicationsToVault?.(action.publicationIds, action.vaultId).catch(() => {
        // onAddPublicationsToVault already surfaces its own error toast.
      });
    } else if (action.type === 'reorder-vaults') {
      reorder(ownedVaults, action.activeVaultId, action.overVaultId);
    } else if (action.type === 'reorder-shared') {
      reorderShared(sharedVaults, action.activeVaultId, action.overVaultId);
    }
  }, [onAddPublicationsToVault, reorder, ownedVaults, reorderShared, sharedVaults, droppableVaultIds]);

  const handleDragCancel = useCallback(() => setActiveDrag(null), []);

  return {
    sensors,
    orderedOwnedVaults,
    orderedSharedVaults,
    droppableVaultIds,
    activeDrag,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}
