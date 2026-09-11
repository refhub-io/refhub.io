import { useEffect, useState } from 'react';
import { useHotkeys } from '@/hooks/useKeyboardNavigation';
import { useKeyboardContext } from '@/contexts/KeyboardContext';
import { Button } from '@/components/ui/button';
import { KbdHint } from '@/components/ui/KbdHint';
import { TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InboxItemCard } from './InboxItemCard';
import { InboxItemRow } from './InboxItemRow';
import { LayoutGrid, List as ListIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getShortcut } from '@/config/kbd.config';
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

type ViewMode = 'cards' | 'list';
const VIEW_MODE_STORAGE_KEY = 'inbox-view-mode';

function readPersistedViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return stored === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

export function InboxQueue({ items, duplicateTitles, vaults, tags, onAccept, onReject, onMerge, onPostpone }: InboxQueueProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, { vaultId: string | null; tagIds: string[] }>>({});
  const [viewMode, setViewMode] = useState<ViewMode>(readPersistedViewMode);

  const kbCtx = useKeyboardContext();
  useEffect(() => {
    kbCtx.pushContext('inbox');
    return () => kbCtx.popContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // Per-viewer convenience only -- fine to silently drop in private browsing etc.
    }
  }, [viewMode]);

  // Seeds a card's vault/tag selection from the computed suggestion the first
  // time it becomes available, without clobbering a selection the user has
  // already touched (selections[item.id] already existing means either).
  useEffect(() => {
    items.forEach((item) => {
      if (item.suggested_vault_id === null && (!item.suggested_tag_ids || item.suggested_tag_ids.length === 0)) return;
      setSelections((prev) => {
        if (prev[item.id]) return prev;
        return {
          ...prev,
          [item.id]: { vaultId: item.suggested_vault_id, tagIds: item.suggested_tag_ids ?? [] },
        };
      });
    });
  }, [items]);

  // Clamp to [0, items.length - 1] on both ends -- 'j' at the end of an
  // already-empty (or about-to-empty) queue can drive focusedIndex to -1
  // (Math.min(i + 1, items.length - 1) with items.length === 0), and without
  // the lower clamp too, items[-1] stays undefined even after items reappear
  // until an unrelated 'k' press happens to correct it back to 0.
  const clampedIndex = Math.max(0, Math.min(focusedIndex, Math.max(items.length - 1, 0)));
  const focusedItem = items[clampedIndex];

  const getSelection = (id: string) => selections[id] ?? { vaultId: null, tagIds: [] };

  // Combos/descriptions read from kbdConfig.inbox (the single source of
  // truth the help overlay and <KbdHint>s also read from) rather than being
  // repeated here as literals, which could silently drift from what's
  // actually documented.
  useHotkeys('inbox', [
    { ...getShortcut('inbox', 'toggleView'), handler: () => setViewMode((prev) => (prev === 'cards' ? 'list' : 'cards')) },
    { ...getShortcut('inbox', 'moveDown'), handler: () => setFocusedIndex((i) => Math.min(i + 1, items.length - 1)) },
    { ...getShortcut('inbox', 'moveUp'), handler: () => setFocusedIndex((i) => Math.max(i - 1, 0)) },
    { ...getShortcut('inbox', 'accept'), handler: () => {
      if (!focusedItem) return;
      const sel = getSelection(focusedItem.id);
      if (sel.vaultId) onAccept(focusedItem.id, sel.vaultId, sel.tagIds);
    } },
    { ...getShortcut('inbox', 'reject'), handler: () => { if (focusedItem) onReject(focusedItem.id); } },
    { ...getShortcut('inbox', 'merge'), handler: () => {
      if (focusedItem && duplicateTitles[focusedItem.id]) onMerge(focusedItem.id);
    } },
    { ...getShortcut('inbox', 'postpone'), handler: () => { if (focusedItem) onPostpone(focusedItem.id); } },
  ], [items, focusedIndex, selections, duplicateTitles, onAccept, onReject, onMerge, onPostpone]);

  const itemProps = (item: InboxItem, index: number) => {
    const sel = getSelection(item.id);
    return {
      key: item.id,
      item,
      duplicatePublicationTitle: duplicateTitles[item.id] ?? null,
      vaults,
      tags,
      selectedVaultId: sel.vaultId,
      selectedTagIds: sel.tagIds,
      onVaultChange: (vaultId: string | null) => setSelections((prev) => ({ ...prev, [item.id]: { ...getSelection(item.id), vaultId } })),
      onTagsChange: (tagIds: string[]) => setSelections((prev) => ({ ...prev, [item.id]: { ...getSelection(item.id), tagIds } })),
      onAccept: () => { if (sel.vaultId) onAccept(item.id, sel.vaultId, sel.tagIds); },
      onReject: () => onReject(item.id),
      onMerge: () => onMerge(item.id),
      onPostpone: () => onPostpone(item.id),
      focused: index === clampedIndex,
    };
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-muted-foreground">
          {items.length} pending
        </p>
        <div className="flex items-center gap-1.5">
          <KbdHint shortcut="v" className="hidden sm:inline-flex" />
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Card view"
              aria-pressed={viewMode === 'cards'}
              onClick={() => setViewMode('cards')}
              className={cn('h-7 w-7 rounded-none', viewMode === 'cards' && 'bg-muted text-primary')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={cn('h-7 w-7 rounded-none', viewMode === 'list' && 'bg-muted text-primary')}
            >
              <ListIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {viewMode === 'list' ? (
        <TooltipProvider delayDuration={200}>
          <div className="w-full border border-border rounded-lg overflow-auto scrollbar-thin">
            <table className="w-full min-w-max caption-bottom text-sm">
              <TableHeader className="[&_tr]:border-b sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="font-mono text-xs">Title</TableHead>
                  <TableHead className="font-mono text-xs">Source</TableHead>
                  <TableHead className="font-mono text-xs">Status</TableHead>
                  <TableHead className="font-mono text-xs">Vault</TableHead>
                  <TableHead className="font-mono text-xs">Tags</TableHead>
                  <TableHead className="font-mono text-xs w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <InboxItemRow {...itemProps(item, index)} />
                ))}
              </TableBody>
            </table>
          </div>
        </TooltipProvider>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <InboxItemCard {...itemProps(item, index)} />
          ))}
        </div>
      )}
    </div>
  );
}
