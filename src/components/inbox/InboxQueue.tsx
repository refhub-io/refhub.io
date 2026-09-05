import { useEffect, useState } from 'react';
import { useHotkeys } from '@/hooks/useKeyboardNavigation';
import { useKeyboardContext } from '@/contexts/KeyboardContext';
import { InboxItemCard } from './InboxItemCard';
import type { InboxItem, Vault, Tag } from '@/types/database';

export interface InboxQueueProps {
  items: InboxItem[];
  duplicateTitles: Record<string, string>; // itemId -> existing publication title
  vaults: Vault[];
  tags: Tag[];
  onAccept: (id: string, vaultId: string, tagIds: string[]) => void;
  onReject: (id: string) => void;
  onMerge: (id: string) => void;
  onPostpone: (id: string) => void;
}

export function InboxQueue({ items, duplicateTitles, vaults, tags, onAccept, onReject, onMerge, onPostpone }: InboxQueueProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, { vaultId: string | null; tagIds: string[] }>>({});

  const kbCtx = useKeyboardContext();
  useEffect(() => {
    kbCtx.pushContext('inbox');
    return () => kbCtx.popContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clampedIndex = Math.min(focusedIndex, Math.max(items.length - 1, 0));
  const focusedItem = items[clampedIndex];

  const getSelection = (id: string) => selections[id] ?? { vaultId: null, tagIds: [] };

  useHotkeys('inbox', [
    { combo: 'j', description: 'Next item', handler: () => setFocusedIndex((i) => Math.min(i + 1, items.length - 1)) },
    { combo: 'k', description: 'Previous item', handler: () => setFocusedIndex((i) => Math.max(i - 1, 0)) },
    { combo: 'a', description: 'Accept focused item', handler: () => {
      if (!focusedItem) return;
      const sel = getSelection(focusedItem.id);
      if (sel.vaultId) onAccept(focusedItem.id, sel.vaultId, sel.tagIds);
    } },
    { combo: 'x', description: 'Reject focused item', handler: () => { if (focusedItem) onReject(focusedItem.id); } },
    { combo: 'm', description: 'Merge focused item', handler: () => {
      if (focusedItem && duplicateTitles[focusedItem.id]) onMerge(focusedItem.id);
    } },
    { combo: 's', description: 'Postpone focused item', handler: () => { if (focusedItem) onPostpone(focusedItem.id); } },
  ], [items, focusedIndex, selections]);

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const sel = getSelection(item.id);
        return (
          <InboxItemCard
            key={item.id}
            item={item}
            duplicatePublicationTitle={duplicateTitles[item.id] ?? null}
            vaults={vaults}
            tags={tags}
            selectedVaultId={sel.vaultId}
            selectedTagIds={sel.tagIds}
            onVaultChange={(vaultId) => setSelections((prev) => ({ ...prev, [item.id]: { ...getSelection(item.id), vaultId } }))}
            onTagsChange={(tagIds) => setSelections((prev) => ({ ...prev, [item.id]: { ...getSelection(item.id), tagIds } }))}
            onAccept={() => { if (sel.vaultId) onAccept(item.id, sel.vaultId, sel.tagIds); }}
            onReject={() => onReject(item.id)}
            onMerge={() => onMerge(item.id)}
            onPostpone={() => onPostpone(item.id)}
            focused={index === clampedIndex}
          />
        );
      })}
    </div>
  );
}
