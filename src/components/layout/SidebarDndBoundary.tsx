import { DndContext, DragOverlay } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { useAuth } from '@/hooks/useAuth';
import { useVaultDragAndDrop } from '@/hooks/useVaultDragAndDrop';
import { VaultDragOverlayContent } from '@/components/dnd/VaultDragOverlayContent';
import { Sidebar, SidebarProps } from './Sidebar';

interface SidebarDndBoundaryProps extends Omit<SidebarProps, 'vaults' | 'droppableVaultIds' | 'isDraggingPublication'> {
  /** Owned vaults, unordered — reordering + persistence happen inside. */
  vaults: SidebarProps['vaults'];
}

/**
 * Renders <Sidebar> wrapped in its own DndContext, so owned-vault drag
 * reordering works on pages with no publication list to drag (Codex,
 * researcher profiles, public vault view). Dashboard/VaultDetail don't use
 * this — they own a wider DndContext that also covers dragging a paper
 * card onto a vault, which needs the publication list and vault sidebar to
 * share one context.
 */
export function SidebarDndBoundary({ vaults, sharedVaults = [], ...sidebarProps }: SidebarDndBoundaryProps) {
  const { user } = useAuth();
  const vaultDnd = useVaultDragAndDrop({
    userId: user?.id,
    ownedVaults: vaults,
    sharedVaults,
  });

  return (
    <DndContext
      sensors={vaultDnd.sensors}
      onDragStart={vaultDnd.handleDragStart}
      onDragEnd={vaultDnd.handleDragEnd}
      onDragCancel={vaultDnd.handleDragCancel}
    >
      <Sidebar {...sidebarProps} vaults={vaultDnd.orderedOwnedVaults} sharedVaults={vaultDnd.orderedSharedVaults} />
      <DragOverlay modifiers={[snapCenterToCursor]} style={{ width: 'fit-content' }}>
        <VaultDragOverlayContent activeDrag={vaultDnd.activeDrag} />
      </DragOverlay>
    </DndContext>
  );
}
