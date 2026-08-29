import { FolderOpen } from 'lucide-react';
import { ActiveVaultDrag } from '@/hooks/useVaultDragAndDrop';

interface VaultDragOverlayContentProps {
  activeDrag: ActiveVaultDrag | null;
}

/** Ghost shown under the pointer while dragging — a paper (or paper
 * selection) onto a vault, or a vault being reordered in the sidebar. */
export function VaultDragOverlayContent({ activeDrag }: VaultDragOverlayContentProps) {
  if (!activeDrag) return null;

  if (activeDrag.type === 'publication') {
    const count = activeDrag.publicationCount ?? 1;
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground shadow-lg border-2 border-primary/50">
        <FolderOpen className="w-4 h-4 shrink-0" />
        {count > 1 ? `${count} papers` : '1 paper'}
      </div>
    );
  }

  if (!activeDrag.vault) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-sidebar border-2 border-primary/50 shadow-lg">
      <div className="w-3 h-3 rounded-md shrink-0" style={{ backgroundColor: activeDrag.vault.color }} />
      <span className="truncate">{activeDrag.vault.name}</span>
    </div>
  );
}
