import { CSSProperties, ReactNode, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface VaultSortHandle {
  ref: (node: HTMLElement | null) => void;
  style: CSSProperties;
  isOver: boolean;
  isDragging: boolean;
  /** Spread onto the small grip icon — not the whole row — so a plain
   * click still opens the vault instead of arming a drag. */
  dragHandleProps: {
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners: ReturnType<typeof useSortable>['listeners'];
  };
}

interface SortableVaultRowProps {
  vaultId: string;
  /** 'vault' (owned, default), 'favorite', or 'shared' — kept distinct so
   * dragging across sidebar lists resolves to a no-op instead of reordering
   * the wrong one. */
  dragType?: 'vault' | 'favorite' | 'shared';
  children: (handle: VaultSortHandle) => ReactNode;
}

/** Owned vaults are always droppable and always reorderable, so one hook
 * covers both. Favorites reuse this for reordering only. Shared vaults are
 * always kept fully droppable+sortable here too — dnd-kit's `disabled`
 * removes a row from collision detection *entirely*, not just from
 * accepting drops, so disabling it per-role would have also made
 * non-editable shared vaults untargetable for reordering. The "can't drop
 * a paper here" permission check happens one layer up instead, in
 * resolveVaultDragEndAction's caller (see useVaultDragAndDrop). */
export function SortableVaultRow({ vaultId, dragType = 'vault', children }: SortableVaultRowProps) {
  const data = useMemo(() => ({ type: dragType }), [dragType]);

  const { attributes, listeners, setNodeRef, transform, transition, isOver, isDragging } = useSortable({
    id: vaultId,
    data,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return <>{children({ ref: setNodeRef, style, isOver, isDragging, dragHandleProps: { attributes, listeners } })}</>;
}
