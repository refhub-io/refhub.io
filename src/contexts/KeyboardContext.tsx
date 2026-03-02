import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import {
  KeyboardContextName,
  CONTEXT_PRIORITY,
  ShortcutDef,
  parseCombo,
  matchesCombo,
  shouldSuppressSingleKey,
  ChordMachine,
  ChordDef,
} from '@/lib/keyboard';
import { debug } from '@/lib/logger';

// ─── Feature flag ────────────────────────────────────────────────────────────

const FEATURE_FLAG_KEY = 'keyboardNav.enabled';

function getFeatureFlag(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = localStorage.getItem(FEATURE_FLAG_KEY);
    // Default to true if no explicit opt-out
    return stored !== 'false';
  } catch {
    return true;
  }
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export type KeyboardAnalyticsEvent = {
  shortcut: string;
  context: KeyboardContextName;
  timestamp: number;
};

type AnalyticsCallback = (event: KeyboardAnalyticsEvent) => void;

// ─── Context types ───────────────────────────────────────────────────────────

interface KeyboardState {
  /** Which keyboard context is currently active. */
  activeContext: KeyboardContextName;
  /** The element that had focus before a dialog/overlay opened. */
  lastFocusedElement: Element | null;
  /** Index of the focused item in the active list (roving focus). */
  focusedIndex: number;
  /** Set of selected item IDs (for multi-select). */
  selectedIds: Set<string>;
  /** Anchor index for range selection. */
  rangeAnchor: number | null;
  /** Whether the help overlay is visible. */
  helpOverlayOpen: boolean;
  /** Whether keyboard nav is enabled (feature flag + user pref). */
  enabled: boolean;
}

interface KeyboardContextValue extends KeyboardState {
  /** Push a new active context (e.g. when a dialog opens). */
  pushContext: (name: KeyboardContextName) => void;
  /** Pop back to the previous context. */
  popContext: () => void;
  /** Directly set the active context. */
  setActiveContext: (name: KeyboardContextName) => void;
  /** Register a set of shortcut definitions; returns an unregister function. */
  registerShortcuts: (defs: ShortcutDef[]) => () => void;
  /** Save the element that should receive focus when a dialog closes. */
  saveFocus: () => void;
  /** Restore focus to the previously saved element. */
  restoreFocus: () => void;
  /** Set the focused index for list navigation. */
  setFocusedIndex: (index: number) => void;
  /** Replace the selected-IDs set entirely. */
  setSelectedIds: (ids: Set<string>) => void;
  /** Toggle a single ID in the selected set. */
  toggleSelectedId: (id: string) => void;
  /** Range-select from anchor to target index. Supply the ordered list of IDs. */
  rangeSelect: (toIndex: number, orderedIds: string[]) => void;
  /** Clear all selections. */
  clearSelection: () => void;
  /** Toggle the help overlay. */
  toggleHelpOverlay: () => void;
  /** Set the help overlay open state directly. */
  setHelpOverlayOpen: (open: boolean) => void;
  /** Enable or disable keyboard navigation. */
  setEnabled: (enabled: boolean) => void;
  /** Register an analytics callback. */
  onAnalytics: (cb: AnalyticsCallback) => () => void;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(() => getFeatureFlag());
  const [activeContext, setActiveContextState] = useState<KeyboardContextName>('global');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const [helpOverlayOpen, setHelpOverlayOpen] = useState(false);
  const lastFocusedRef = useRef<Element | null>(null);

  // Context stack for push/pop
  const contextStackRef = useRef<KeyboardContextName[]>(['global']);

  // Registered shortcuts (mutable ref to avoid re-renders on every register)
  const shortcutsRef = useRef<ShortcutDef[]>([]);

  // Chord machine
  const chordMachineRef = useRef<ChordMachine>(new ChordMachine([]));

  // Analytics callbacks
  const analyticsCallbacksRef = useRef<Set<AnalyticsCallback>>(new Set());

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    try {
      localStorage.setItem(FEATURE_FLAG_KEY, String(value));
    } catch { /* ignore */ }
  }, []);

  const pushContext = useCallback((name: KeyboardContextName) => {
    contextStackRef.current = [...contextStackRef.current, name];
    setActiveContextState(name);
    debug('KeyboardContext', 'pushContext', name, contextStackRef.current);
  }, []);

  const popContext = useCallback(() => {
    if (contextStackRef.current.length > 1) {
      contextStackRef.current = contextStackRef.current.slice(0, -1);
      const top = contextStackRef.current[contextStackRef.current.length - 1];
      setActiveContextState(top);
      debug('KeyboardContext', 'popContext -> ', top);
    }
  }, []);

  const setActiveContext = useCallback((name: KeyboardContextName) => {
    contextStackRef.current = ['global', name];
    setActiveContextState(name);
  }, []);

  const registerShortcuts = useCallback((defs: ShortcutDef[]) => {
    shortcutsRef.current = [...shortcutsRef.current, ...defs];
    return () => {
      shortcutsRef.current = shortcutsRef.current.filter(
        (d) => !defs.includes(d),
      );
    };
  }, []);

  const saveFocus = useCallback(() => {
    lastFocusedRef.current = document.activeElement;
  }, []);

  const restoreFocus = useCallback(() => {
    if (lastFocusedRef.current && lastFocusedRef.current instanceof HTMLElement) {
      lastFocusedRef.current.focus();
      lastFocusedRef.current = null;
    }
  }, []);

  const toggleSelectedId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const rangeSelect = useCallback(
    (toIndex: number, orderedIds: string[]) => {
      const anchor = rangeAnchor ?? focusedIndex;
      const start = Math.min(anchor, toIndex);
      const end = Math.max(anchor, toIndex);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          if (orderedIds[i]) next.add(orderedIds[i]);
        }
        return next;
      });
    },
    [rangeAnchor, focusedIndex],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setRangeAnchor(null);
  }, []);

  const toggleHelpOverlay = useCallback(() => {
    setHelpOverlayOpen((prev) => !prev);
  }, []);

  const onAnalytics = useCallback((cb: AnalyticsCallback) => {
    analyticsCallbacksRef.current.add(cb);
    return () => {
      analyticsCallbacksRef.current.delete(cb);
    };
  }, []);

  const emitAnalytics = useCallback((shortcut: string, context: KeyboardContextName) => {
    const event: KeyboardAnalyticsEvent = { shortcut, context, timestamp: Date.now() };
    analyticsCallbacksRef.current.forEach((cb) => {
      try { cb(event); } catch { /* swallow */ }
    });
  }, []);

  // ─── Global keydown handler ─────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const allShortcuts = shortcutsRef.current;
      const currentContext = contextStackRef.current[contextStackRef.current.length - 1];
      const inInput = shouldSuppressSingleKey();

      // Sort shortcuts by context priority (highest first)
      const sorted = [...allShortcuts].sort(
        (a, b) =>
          (CONTEXT_PRIORITY[b.context] ?? 0) - (CONTEXT_PRIORITY[a.context] ?? 0),
      );

      for (const def of sorted) {
        // Only fire shortcuts from the active context or from 'global'
        if (def.context !== currentContext && def.context !== 'global') continue;

        // If it's a single-letter shortcut and we're in an input, skip
        const parsed = parseCombo(def.combo);
        const isSingleKey = parsed.modifiers.size === 0 && parsed.key.length === 1;
        if (isSingleKey && inInput && !def.allowInInput) continue;

        if (matchesCombo(e, parsed)) {
          e.preventDefault();
          const handled = def.handler(e);
          emitAnalytics(def.combo, def.context);
          debug('KeyboardContext', `shortcut matched: ${def.combo} in ${def.context}`);
          if (handled !== false) return; // stop propagation to lower-priority shortcuts
        }
      }

      // Feed non-modifier keys into chord machine (only when not in input)
      if (!inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        chordMachineRef.current.feed(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, emitAnalytics]);

  // Expose chord machine updater
  const updateChords = useCallback((defs: ChordDef[]) => {
    chordMachineRef.current.updateDefs(defs);
  }, []);

  const value: KeyboardContextValue = {
    activeContext,
    lastFocusedElement: lastFocusedRef.current,
    focusedIndex,
    selectedIds,
    rangeAnchor,
    helpOverlayOpen,
    enabled,
    pushContext,
    popContext,
    setActiveContext,
    registerShortcuts,
    saveFocus,
    restoreFocus,
    setFocusedIndex,
    setSelectedIds,
    toggleSelectedId,
    rangeSelect,
    clearSelection,
    toggleHelpOverlay,
    setHelpOverlayOpen,
    setEnabled,
    onAnalytics,
  };

  return (
    <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useKeyboardContext(): KeyboardContextValue {
  const ctx = useContext(KeyboardContext);
  if (!ctx) {
    throw new Error('useKeyboardContext must be used within a KeyboardProvider');
  }
  return ctx;
}
