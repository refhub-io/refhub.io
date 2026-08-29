import { ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';

export interface PublicationDragHandle {
  ref: (node: HTMLElement | null) => void;
  listeners: ReturnType<typeof useDraggable>['listeners'];
  attributes: ReturnType<typeof useDraggable>['attributes'];
  isDragging: boolean;
}

interface DraggablePublicationProps {
  publicationId: string;
  /** Ids to add to the drop target when this drag is released — the full
   * multi-select if this paper is part of one, otherwise just itself. */
  dragPublicationIds: string[];
  /** True when the viewer can't add papers from here (e.g. a read-only
   * shared vault) — the card/row renders normally but won't lift. */
  disabled?: boolean;
  children: (handle: PublicationDragHandle) => ReactNode;
}

/**
 * Makes a paper card/row draggable onto a sidebar vault. Render-prop so the
 * caller can attach the drag ref/listeners to whatever its root DOM node is
 * (a <div> for cards, a <tr> for table rows) rather than us imposing one.
 */
export function DraggablePublication({ publicationId, dragPublicationIds, disabled, children }: DraggablePublicationProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `publication:${publicationId}`,
    data: { type: 'publication' as const, publicationIds: dragPublicationIds },
    disabled,
  });

  return <>{children({ ref: setNodeRef, listeners, attributes, isDragging })}</>;
}
