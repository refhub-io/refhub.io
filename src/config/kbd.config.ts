/**
 * Global keyboard shortcut configuration.
 *
 * Edit this file to remap any keybinding in the app.
 * Each context group contains named shortcuts with their key combo(s) and a
 * human-readable description shown in the help overlay.
 *
 * Combo syntax:
 *   - Modifier keys: Ctrl, Alt, Shift, Meta (or Cmd/⌘ — normalised cross-platform)
 *   - Join with `+`: "Ctrl+S", "Meta+K"
 *   - Single keys: "j", "?", "Enter", "Space", "Escape"
 *   - Alternatives separated by " / ": "j / ↓" (display-only, first is canonical)
 */

export interface ShortcutConfig {
  /** The key combo string (e.g. "Ctrl+S"). For display alternatives use " / ". */
  combo: string;
  /** Description shown in help overlay. */
  description: string;
}

export interface ContextShortcuts {
  [shortcutName: string]: ShortcutConfig;
}

export interface KbdConfig {
  global: ContextShortcuts;
  'vault-list': ContextShortcuts;
  'publication-list': ContextShortcuts;
  dialog: ContextShortcuts;
  editor: ContextShortcuts;
  export: ContextShortcuts;
}

const kbdConfig: KbdConfig = {
  // ─── Global ──────────────────────────────────────────────────────────────
  global: {
    quickSearch: {
      combo: 'Meta+K',
      description: 'Focus search',
    },
    helpOverlay: {
      combo: '?',
      description: 'Keyboard shortcuts',
    },
    escape: {
      combo: 'Escape',
      description: 'Close / clear selection',
    },
    vaultJump: {
      combo: '1 \u2025 9',
      description: 'Jump to vault by number',
    },
  },

  // ─── Vault List ──────────────────────────────────────────────────────────
  'vault-list': {
    moveDown: {
      combo: 'j / ↓',
      description: 'Move selection down',
    },
    moveUp: {
      combo: 'k / ↑',
      description: 'Move selection up',
    },
    open: {
      combo: 'Enter',
      description: 'Open selected vault',
    },
    options: {
      combo: 'o',
      description: 'Open vault options',
    },
  },

  // ─── Publication List ────────────────────────────────────────────────────
  'publication-list': {
    moveDown: {
      combo: 'j / ↓',
      description: 'Next publication',
    },
    moveUp: {
      combo: 'k / ↑',
      description: 'Previous publication',
    },
    jumpFirst: {
      combo: 'g g / Home',
      description: 'Jump to first item',
    },
    jumpLast: {
      combo: 'G / End',
      description: 'Jump to last item',
    },
    open: {
      combo: 'Enter',
      description: 'Open publication',
    },
    toggleSelect: {
      combo: 'Space',
      description: 'Toggle selection',
    },
    rangeSelect: {
      combo: 'Shift+Space',
      description: 'Range select',
    },
    toggleView: {
      combo: 'v',
      description: 'Toggle view mode',
    },
    selectAll: {
      combo: 'Ctrl+A',
      description: 'Select all',
    },
    export: {
      combo: 'Ctrl+E',
      description: 'Export selected',
    },
    delete: {
      combo: 'd / Delete',
      description: 'Delete selected',
    },
  },

  // ─── Dialogs / Modals ───────────────────────────────────────────────────
  dialog: {
    close: {
      combo: 'Escape',
      description: 'Close dialog',
    },
    save: {
      combo: 'Ctrl+S',
      description: 'Save changes',
    },
    nextField: {
      combo: 'Tab',
      description: 'Next field',
    },
    prevField: {
      combo: 'Shift+Tab',
      description: 'Previous field',
    },
  },

  // ─── Notes Editor ───────────────────────────────────────────────────────
  editor: {
    save: {
      combo: 'Ctrl+S',
      description: 'Save notes',
    },
    exitFullscreen: {
      combo: 'Escape',
      description: 'Exit fullscreen',
    },
  },

  // ─── Export ─────────────────────────────────────────────────────────────
  export: {
    openExport: {
      combo: 'Ctrl+E',
      description: 'Open export dialog',
    },
  },
};

export default kbdConfig;

// ─── Helper utilities ────────────────────────────────────────────────────────

type ContextName = keyof KbdConfig;

/**
 * Look up a shortcut config by context and name.
 *
 * ```ts
 * const combo = getShortcut('dialog', 'save').combo; // "Ctrl+S"
 * ```
 */
export function getShortcut<C extends ContextName>(
  context: C,
  name: keyof KbdConfig[C],
): ShortcutConfig {
  const ctx = kbdConfig[context] as ContextShortcuts;
  const shortcut = ctx[name as string];
  if (!shortcut) {
    throw new Error(`Unknown shortcut: ${context}.${String(name)}`);
  }
  return shortcut;
}

/**
 * Get the canonical combo string (first alternative before " / ").
 */
export function getCombo<C extends ContextName>(
  context: C,
  name: keyof KbdConfig[C],
): string {
  const { combo } = getShortcut(context, name);
  // Return the first alternative (before " / ")
  return combo.split(' / ')[0].trim();
}

/**
 * Get the full display combo string (with alternatives).
 */
export function getDisplayCombo<C extends ContextName>(
  context: C,
  name: keyof KbdConfig[C],
): string {
  return getShortcut(context, name).combo;
}

/**
 * Return the entire config. Useful for iterating over all groups.
 */
export function getKbdConfig(): KbdConfig {
  return kbdConfig;
}
