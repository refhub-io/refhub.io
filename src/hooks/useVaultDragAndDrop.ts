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
import { getDroppableVaultIds, resolveVaultDragEndAction } from '@/lib/vaultSidebarDnd';

interface UseVaultDragAndDropOptions {
  userId: string | null | undefined;
  ownedVaults: Vault[];
  /** Role the current user holds on each shared (non-owned) vault, by vault id. */
  sharedVaultRoles?: Record<string, VaultRole>;
  onAddPublicationsToVault: (publicationIds: string[], vaultId: string) => Promise<void>;
}

export interface ActiveVaultDrag {
  type: 'publication' | 'vault';
  publicationCount?: number;
  vault?: Vault;
}

export function useVaultDragAndDrop({
  userId,
  ownedVaults,
  sharedVaultRoles = {},
  onAddPublicationsToVault,
}: UseVaultDragAndDropOptions) {
  const { orderVaults, reorder } = useVaultSidebarOrder(userId);
  const [activeDrag, setActiveDrag] = useState<ActiveVaultDrag | null>(null);

  const orderedOwnedVaults = useMemo(() => orderVaults(ownedVaults), [orderVaults, ownedVaults]);

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
    return map;
  }, [ownedVaults]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { type?: 'publication' | 'vault'; publicationIds?: string[] } | undefined;
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
        data: event.active.data.current as { type?: 'publication' | 'vault'; publicationIds?: string[] } | undefined ?? {},
      },
      over: event.over
        ? { id: String(event.over.id), data: event.over.data.current as { type?: 'publication' | 'vault' } | undefined ?? {} }
        : null,
    });

    if (action.type === 'add-to-vault') {
      onAddPublicationsToVault(action.publicationIds, action.vaultId).catch(() => {
        // onAddPublicationsToVault already surfaces its own error toast.
      });
    } else if (action.type === 'reorder-vaults') {
      reorder(ownedVaults, action.activeVaultId, action.overVaultId);
    }
  }, [onAddPublicationsToVault, reorder, ownedVaults]);

  const handleDragCancel = useCallback(() => setActiveDrag(null), []);

  return {
    sensors,
    orderedOwnedVaults,
    droppableVaultIds,
    activeDrag,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}
