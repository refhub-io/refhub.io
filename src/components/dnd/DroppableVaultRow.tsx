import { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';

export interface VaultDropHandle {
  ref: (node: HTMLElement | null) => void;
  isOver: boolean;
}

interface DroppableVaultRowProps {
  vaultId: string;
  /** False for a shared vault the current user can't edit — excluded from
   * collision detection entirely, so it never highlights or accepts a drop. */
  droppable: boolean;
  children: (handle: VaultDropHandle) => ReactNode;
}

export function DroppableVaultRow({ vaultId, droppable, children }: DroppableVaultRowProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: vaultId,
    data: { type: 'vault' as const },
    disabled: !droppable,
  });

  return <>{children({ ref: setNodeRef, isOver: droppable && isOver })}</>;
}
