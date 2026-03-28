import { useEffect, useCallback, useRef, useState } from 'react';
import { useKeyboardContext } from '@/contexts/KeyboardContext';
import {
  KeyboardContextName,
  ShortcutDef,
  ChordMachine,
  ChordDef,
  shouldSuppressSingleKey,
} from '@/lib/keyboard';

// ─── useHotkeys ──────────────────────────────────────────────────────────────

export interface HotkeyDef {
  combo: string;
  description: string;
  handler: (e: KeyboardEvent) => boolean | void;
  allowInInput?: boolean;
}

/**
 * Register hotkeys scoped to a keyboard context.
 * Shortcuts are automatically unregistered on unmount.
 */
export function useHotkeys(
  context: KeyboardContextName,
  defs: HotkeyDef[],
  deps: unknown[] = [],
) {
  const { registerShortcuts, enabled } = useKeyboardContext();

  useEffect(() => {
    if (!enabled) return;

    const shortcutDefs: ShortcutDef[] = defs.map((d) => ({
      combo: d.combo,
      description: d.description,
      context,
      handler: d.handler,
      allowInInput: d.allowInInput,
    }));

    return registerShortcuts(shortcutDefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, context, registerShortcuts, ...deps]);
}

// ─── useKeyboardNavigation ───────────────────────────────────────────────────

export interface UseKeyboardNavigationOptions {
  /** The keyboard context to register under. */
  context: KeyboardContextName;
  /** Ordered list of item IDs, matching the visual order on screen. */
  itemIds: string[];
  /** Called when the user presses Enter on the focused item. */
  onOpen?: (id: string, index: number) => void;
  /** Called when the user presses 'd' or Delete on selected items. */
  onDelete?: (ids: string[]) => void;
  /** Called when the user presses 'v' to toggle view. */
  onToggleView?: () => void;
  /** Called when user presses Ctrl+E for export. */
  onExport?: (ids: string[]) => void;
  /** Whether to activate this context when the hook mounts. Default: false. */
  activateOnMount?: boolean;
  /** Ref to the list container for aria-activedescendant management. */
  containerRef?: React.RefObject<HTMLElement>;
  /** When this key changes, force-reactivate the context and reset navigation state. */
  resetKey?: string;
  /**
   * When true, installs a window keydown listener that activates this context
   * the first time a navigation key (j/k/arrows) is pressed, even before the
   * user has clicked anything. Only enable this for the primary content list;
   * do NOT enable for sidebar / secondary lists to avoid context conflicts.
   */
  bootstrapOnNav?: boolean;
}

export interface UseKeyboardNavigationReturn {
  /** Currently focused index (0-based). */
  focusedIndex: number;
  /** Set of selected item IDs. */
  selectedIds: Set<string>;
  /** Whether a specific index is the focused one. */
  isFocused: (index: number) => boolean;
  /** Whether a specific ID is selected. */
  isSelected: (id: string) => boolean;
  /** Props to spread onto the list container element. */
  containerProps: {
    role: string;
    'aria-activedescendant': string | undefined;
  };
  /** Generate props for each list item. */
  itemProps: (index: number, id: string) => {
    id: string;
    role: string;
    'aria-selected': boolean;
    tabIndex: number;
    'data-focused': boolean;
    onClick: (e: React.MouseEvent) => void;
    onDoubleClick: () => void;
  };
  /** Manually set the focused index. */
  setFocusedIndex: (index: number) => void;
  /** Manually set selected IDs (accepts a value or an updater function). */
  setSelectedIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  /** Clear all selections. */
  clearSelection: () => void;
  /** Select all items. */
  selectAll: () => void;
  /** Explicitly activate this context so j/k shortcuts work. Call after data loads. */
  activate: () => void;
}

/**
 * Full keyboard navigation hook for lists.
 * Provides roving focus, multi-select, chord support, and accessibility attributes.
 */
export function useKeyboardNavigation(
  options: UseKeyboardNavigationOptions,
): UseKeyboardNavigationReturn {
  const {
    context,
    itemIds,
    onOpen,
    onDelete,
    onToggleView,
    onExport,
    activateOnMount = false,
    containerRef,
    resetKey,
    bootstrapOnNav = false,
  } = options;

  const kb = useKeyboardContext();
  const [localFocusedIndex, setLocalFocusedIndex] = useState(0);
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set());
  const rangeAnchorRef = useRef<number | null>(null);

  const itemIdsRef = useRef(itemIds);
  itemIdsRef.current = itemIds;

  const focusedIndexRef = useRef(localFocusedIndex);
  focusedIndexRef.current = localFocusedIndex;

  const selectedIdsRef = useRef(localSelectedIds);
  selectedIdsRef.current = localSelectedIds;

  // Keep focused index in bounds when item count changes
  useEffect(() => {
    if (localFocusedIndex >= itemIds.length && itemIds.length > 0) {
      setLocalFocusedIndex(itemIds.length - 1);
    }
  }, [itemIds.length, localFocusedIndex]);

  // ─── Context activation ──────────────────────────────────────────────────
  // Shortcuts are captured on `window` by the global keydown handler in
  // KeyboardContext — DOM focus on the list container is NOT required.
  // All we need is `activeContext === context` and items in the list.
  //
  // activate() is IDEMPOTENT: calling it when already active is a no-op
  // (no extra re-renders), so it's safe to call liberally.

  const activate = useCallback(() => {
    if (!kb.enabled) return;
    // Always update the ref (even if state value is the same — ref write is free)
    kb.setActiveContext(context);
    setLocalFocusedIndex(0);
    // Avoid creating a new Set reference when already empty
    setLocalSelectedIds(prev => prev.size === 0 ? prev : new Set());
    rangeAnchorRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kb.enabled, kb.setActiveContext, context]);

  // Like activate() but preserves selection — used when the item list changes
  // due to search/filter (not a vault/page transition).
  const activateKeepSelection = useCallback(() => {
    if (!kb.enabled) return;
    kb.setActiveContext(context);
    // Clamp focused index in case the list shrank
    setLocalFocusedIndex(prev =>
      itemIdsRef.current.length === 0 ? 0 : Math.min(prev, itemIdsRef.current.length - 1)
    );
    // Do NOT touch localSelectedIds — selections persist through filter changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kb.enabled, kb.setActiveContext, context]);

  // Track whether we have done the initial activation yet.
  const hasActivatedRef = useRef(false);

  // Activate context immediately on mount so toolbar shortcuts (f/s/p/v) work
  // before the user clicks anything. Navigation shortcuts (j/k) are harmless
  // when there are no items yet.
  useEffect(() => {
    if (!activateOnMount || !kb.enabled) return;

    if (!hasActivatedRef.current) {
      hasActivatedRef.current = true;
      activate();
    } else {
      activateKeepSelection();
    }
  }, [activateOnMount, kb.enabled, itemIds.length, activate, activateKeepSelection]);

  // When switching vaults/pages (resetKey changes) → always do a full reset.
  // Also reset our "has activated" guard so the next item load is treated as fresh.
  const prevResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== undefined && resetKey !== prevResetKeyRef.current) {
      prevResetKeyRef.current = resetKey;
      if (kb.enabled) {
        // Full reset — clear selection and focused index for the new vault/page.
        // Also clear the "has activated" guard so the incoming item list is treated fresh.
        hasActivatedRef.current = false;
        activate();
      }
    }
  }, [resetKey, kb.enabled, activate]);

  // Scroll focused item into view
  const scrollIntoView = useCallback(
    (index: number) => {
      const itemId = `kb-item-${context}-${index}`;
      const el = document.getElementById(itemId);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
    [context],
  );

  const moveFocus = useCallback(
    (delta: number) => {
      setLocalFocusedIndex((prev) => {
        const next = Math.max(0, Math.min(itemIdsRef.current.length - 1, prev + delta));
        scrollIntoView(next);
        return next;
      });
    },
    [scrollIntoView],
  );

  const jumpTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(itemIdsRef.current.length - 1, index));
      setLocalFocusedIndex(clamped);
      scrollIntoView(clamped);
    },
    [scrollIntoView],
  );

  const toggleSelection = useCallback(
    (index: number) => {
      const id = itemIdsRef.current[index];
      if (!id) return;
      setLocalSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      rangeAnchorRef.current = index;
    },
    [],
  );

  const doRangeSelect = useCallback(
    (toIndex: number) => {
      const anchor = rangeAnchorRef.current;
      if (anchor == null) return;
      const start = Math.min(anchor, toIndex);
      const end = Math.max(anchor, toIndex);
      // Replace selection with exactly the range (including the anchor).
      // This ensures moving back (Shift+K after Shift+J) deselects items.
      const next = new Set<string>();
      for (let i = start; i <= end; i++) {
        const id = itemIdsRef.current[i];
        if (id) next.add(id);
      }
      setLocalSelectedIds(next);
    },
    [],
  );

  const selectAll = useCallback(() => {
    setLocalSelectedIds(new Set(itemIdsRef.current));
  }, []);

  const clearSelection = useCallback(() => {
    setLocalSelectedIds(new Set());
    rangeAnchorRef.current = null;
  }, []);

  // Set up chord machine for g-g and G
  const chordRef = useRef<ChordMachine | null>(null);

  useEffect(() => {
    const chordDefs: ChordDef[] = [
      {
        sequence: ['g', 'g'],
        callback: () => jumpTo(0),
      },
    ];
    if (!chordRef.current) {
      chordRef.current = new ChordMachine(chordDefs);
    } else {
      chordRef.current.updateDefs(chordDefs);
    }
  }, [jumpTo]);

  // ─── Bootstrap listener ───────────────────────────────────────────────────
  // If the user presses a navigation key (j/k/arrows) but this context isn't
  // yet active (e.g. just navigated to the page), auto-activate it so the
  // first keypress works without requiring a click on the list first.
  // Only installed when bootstrapOnNav is explicitly enabled.
  useEffect(() => {
    if (!bootstrapOnNav) return;
    if (!kb.enabled) return;

    const NAV_KEYS = new Set(['j', 'k', 'ArrowDown', 'ArrowUp', 'Home', 'End']);

    const handleBootstrap = (e: KeyboardEvent) => {
      if (!NAV_KEYS.has(e.key)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (shouldSuppressSingleKey()) return;
      if (itemIdsRef.current.length === 0) return;
      // Already active — normal hotkey handler will take care of it.
      if (kb.activeContext === context) return;
      // Another specific context is already in control (e.g. vault-list while
      // we are publication-list). Don't steal it — only bootstrap from the
      // neutral 'global' baseline.
      if (kb.activeContext !== 'global') return;

      // Force-activate this context so the registered hotkeys can fire.
      kb.setActiveContext(context);

      // Also handle the movement ourselves for this keypress because the
      // registered hotkey handler checks activeContext synchronously and
      // would have already been skipped before we changed it.
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        // Already at 0; nothing to move, but focus is now visible.
      } else if (e.key === 'Home') {
        e.preventDefault();
        jumpTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        jumpTo(itemIdsRef.current.length - 1);
      }
    };

    // Use capture phase so we run before other listeners.
    window.addEventListener('keydown', handleBootstrap, true);
    return () => window.removeEventListener('keydown', handleBootstrap, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapOnNav, kb.enabled, kb.activeContext, kb.setActiveContext, context, moveFocus, jumpTo]);

  // Register keyboard shortcuts
  useHotkeys(
    context,
    [
      // Navigation
      {
        combo: 'j',
        description: 'Move focus down',
        handler: () => { moveFocus(1); return true; },
      },
      {
        combo: 'ArrowDown',
        description: 'Move focus down',
        handler: () => { moveFocus(1); return true; },
      },
      {
        combo: 'k',
        description: 'Move focus up',
        handler: () => { moveFocus(-1); return true; },
      },
      {
        combo: 'ArrowUp',
        description: 'Move focus up',
        handler: () => { moveFocus(-1); return true; },
      },
      // Jump to ends
      {
        combo: 'Home',
        description: 'Jump to first item',
        handler: () => { jumpTo(0); return true; },
      },
      {
        combo: 'End',
        description: 'Jump to last item',
        handler: () => { jumpTo(itemIdsRef.current.length - 1); return true; },
      },
      // G (Shift+G) = jump to last
      {
        combo: 'Shift+g',
        description: 'Jump to last item',
        handler: () => { jumpTo(itemIdsRef.current.length - 1); return true; },
      },
      // Enter: open
      {
        combo: 'Enter',
        description: 'Open focused item',
        handler: () => {
          const id = itemIdsRef.current[focusedIndexRef.current];
          if (id && onOpen) onOpen(id, focusedIndexRef.current);
          return true;
        },
      },
      // Space: toggle selection
      {
        combo: 'Space',
        description: 'Toggle selection',
        handler: (e) => {
          if (e.shiftKey) {
            // Range select
            doRangeSelect(focusedIndexRef.current);
          } else {
            toggleSelection(focusedIndexRef.current);
          }
          return true;
        },
      },
      // v: toggle view
      {
        combo: 'v',
        description: 'Toggle view mode',
        handler: () => {
          onToggleView?.();
          return true;
        },
      },
      // Ctrl+A: select all
      {
        combo: 'Ctrl+a',
        description: 'Select all',
        handler: (e) => { e.preventDefault(); selectAll(); return true; },
        allowInInput: false,
      },
      // Ctrl+E: export
      {
        combo: 'Ctrl+e',
        description: 'Export selected',
        handler: (e) => {
          e.preventDefault();
          const ids = Array.from(selectedIdsRef.current);
          onExport?.(ids.length > 0 ? ids : itemIdsRef.current);
          return true;
        },
        allowInInput: false,
      },
      // d or Delete: delete selected
      {
        combo: 'd',
        description: 'Delete selected',
        handler: () => {
          const ids = Array.from(selectedIdsRef.current);
          if (ids.length > 0) onDelete?.(ids);
          return true;
        },
      },
      {
        combo: 'Delete',
        description: 'Delete selected',
        handler: () => {
          const ids = Array.from(selectedIdsRef.current);
          if (ids.length > 0) onDelete?.(ids);
          return true;
        },
      },
      // Shift+ArrowDown: range select downward
      {
        combo: 'Shift+ArrowDown',
        description: 'Range select down',
        handler: () => {
          if (rangeAnchorRef.current == null) rangeAnchorRef.current = focusedIndexRef.current;
          moveFocus(1);
          queueMicrotask(() => doRangeSelect(focusedIndexRef.current));
          return true;
        },
      },
      // Shift+ArrowUp: range select upward
      {
        combo: 'Shift+ArrowUp',
        description: 'Range select up',
        handler: () => {
          if (rangeAnchorRef.current == null) rangeAnchorRef.current = focusedIndexRef.current;
          moveFocus(-1);
          queueMicrotask(() => doRangeSelect(focusedIndexRef.current));
          return true;
        },
      },
      // Shift+j: range select downward (vim-style)
      {
        combo: 'Shift+j',
        description: 'Range select down',
        handler: () => {
          if (rangeAnchorRef.current == null) rangeAnchorRef.current = focusedIndexRef.current;
          moveFocus(1);
          queueMicrotask(() => doRangeSelect(focusedIndexRef.current));
          return true;
        },
      },
      // Shift+k: range select upward (vim-style)
      {
        combo: 'Shift+k',
        description: 'Range select up',
        handler: () => {
          if (rangeAnchorRef.current == null) rangeAnchorRef.current = focusedIndexRef.current;
          moveFocus(-1);
          queueMicrotask(() => doRangeSelect(focusedIndexRef.current));
          return true;
        },
      },
      // Ctrl+D: deselect all (override browser bookmark)
      {
        combo: 'Ctrl+d',
        description: 'Deselect all',
        handler: (e) => {
          e.preventDefault();
          clearSelection();
          setLocalFocusedIndex(-1);
          return true;
        },
        allowInInput: false,
      },
    ],
    [moveFocus, jumpTo, toggleSelection, doRangeSelect, selectAll, clearSelection, onOpen, onDelete, onToggleView, onExport],
  );

  // Feed single non-modifier keys into chord machine
  useEffect(() => {
    if (!kb.enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldSuppressSingleKey()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (kb.activeContext !== context) return;
      chordRef.current?.feed(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [kb.enabled, kb.activeContext, context]);

  // Item props generator
  const itemProps = useCallback(
    (index: number, id: string) => ({
      id: `kb-item-${context}-${index}`,
      role: 'option' as const,
      'aria-selected': localSelectedIds.has(id),
      tabIndex: index === localFocusedIndex ? 0 : -1,
      'data-focused': index === localFocusedIndex,
      onClick: (e: React.MouseEvent) => {
        // Activate this keyboard context on any click so subsequent
        // keyboard navigation continues from the clicked item.
        if (kb.activeContext !== context) {
          kb.setActiveContext(context);
        }
        if (e.shiftKey) {
          doRangeSelect(index);
        } else if (e.ctrlKey || e.metaKey) {
          toggleSelection(index);
        } else {
          setLocalFocusedIndex(index);
        }
      },
      onDoubleClick: () => {
        const itemId = itemIdsRef.current[index];
        if (itemId && onOpen) onOpen(itemId, index);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [context, localFocusedIndex, localSelectedIds, toggleSelection, doRangeSelect, onOpen],
  );

  const activeDescendant =
    itemIds.length > 0 ? `kb-item-${context}-${localFocusedIndex}` : undefined;

  const containerProps = {
    role: 'listbox',
    'aria-activedescendant': activeDescendant,
  };

  return {
    focusedIndex: localFocusedIndex,
    selectedIds: localSelectedIds,
    isFocused: (index: number) => kb.activeContext === context && index === localFocusedIndex,
    isSelected: (id: string) => localSelectedIds.has(id),
    containerProps,
    itemProps,
    setFocusedIndex: setLocalFocusedIndex,
    setSelectedIds: setLocalSelectedIds,
    clearSelection,
    selectAll,
    activate,
  };
}
