import { CSSProperties, ReactNode } from 'react';
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
  children: (handle: VaultSortHandle) => ReactNode;
}

/** Owned vaults are always droppable (the user can always edit their own
 * vault) and always reorderable, so one hook covers both. */
export function SortableVaultRow({ vaultId, children }: SortableVaultRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isOver, isDragging } = useSortable({
    id: vaultId,
    data: { type: 'vault' as const },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return <>{children({ ref: setNodeRef, style, isOver, isDragging, dragHandleProps: { attributes, listeners } })}</>;
}
