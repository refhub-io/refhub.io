/**
 * Keyboard utilities for normalising keys, detecting chords, managing keymaps,
 * and determining whether a shortcut should fire in the current DOM context.
 */

// ─── Platform detection ──────────────────────────────────────────────────────

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const isWindows =
  typeof navigator !== 'undefined' && /Win/.test(navigator.platform);

// Only treat as touch-only when the screen is small AND there is no
// fine pointer (i.e. no mouse / trackpad).  This avoids disabling keyboard
// shortcuts on laptops with touchscreens.
const isTouchOnlyDevice =
  typeof window !== 'undefined' &&
  'ontouchstart' in window &&
  typeof window.matchMedia === 'function' &&
  !window.matchMedia('(pointer: fine)').matches;

/** @deprecated Use isTouchOnlyDevice — kept for backwards compat */
const isTouchDevice = isTouchOnlyDevice;

export { isMac, isWindows, isTouchDevice, isTouchOnlyDevice };

// ─── Key normalisation ───────────────────────────────────────────────────────

/** Map human-readable modifier names to a canonical order. */
const MOD_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const;
type Modifier = (typeof MOD_ORDER)[number];

export interface ParsedCombo {
  modifiers: Set<Modifier>;
  key: string; // lower-cased non-modifier key
}

/**
 * Parse a shortcut description such as `"Ctrl+Shift+K"` or `"Meta+K"` into
 * a canonical {@link ParsedCombo}.
 *
 * `Meta` is normalised to `Ctrl` on non-Mac and vice-versa if the caller
 * passes the `crossPlatform` option (default `true`), so authors can write
 * `"Meta+K"` and it works everywhere.
 */
export function parseCombo(
  raw: string,
  crossPlatform = true,
): ParsedCombo {
  const parts = raw
    .split('+')
    .map((p) => p.trim().toLowerCase());

  const modifiers = new Set<Modifier>();
  let key = '';

  for (const part of parts) {
    if (part === 'ctrl' || part === 'control') modifiers.add('ctrl');
    else if (part === 'alt' || part === 'option') modifiers.add('alt');
    else if (part === 'shift') modifiers.add('shift');
    else if (part === 'meta' || part === 'cmd' || part === 'command' || part === '⌘')
      modifiers.add('meta');
    else key = part;
  }

  // Cross-platform: treat Meta and Ctrl as interchangeable
  if (crossPlatform) {
    if (isMac && modifiers.has('ctrl') && !modifiers.has('meta')) {
      modifiers.delete('ctrl');
      modifiers.add('meta');
    }
    if (!isMac && modifiers.has('meta') && !modifiers.has('ctrl')) {
      modifiers.delete('meta');
      modifiers.add('ctrl');
    }
  }

  return { modifiers, key };
}

/**
 * Return a pretty display string for a combo.  Uses Mac symbols when running
 * on macOS and spells out modifiers otherwise.
 */
export function formatCombo(raw: string): string {
  const { modifiers, key } = parseCombo(raw, true);
  const parts: string[] = [];

  if (isMac) {
    if (modifiers.has('ctrl')) parts.push('⌃');
    if (modifiers.has('alt')) parts.push('⌥');
    if (modifiers.has('shift')) parts.push('⇧');
    if (modifiers.has('meta')) parts.push('⌘');
  } else {
    if (modifiers.has('ctrl')) parts.push('Ctrl');
    if (modifiers.has('alt')) parts.push('Alt');
    if (modifiers.has('shift')) parts.push('Shift');
    if (modifiers.has('meta')) parts.push(isWindows ? '⊞ Win' : 'Super');
  }

  // Capitalise single letter keys
  const displayKey =
    key.length === 1 ? key.toUpperCase() : KEY_DISPLAY[key] ?? key;
  parts.push(displayKey);
  return parts.join(isMac ? '' : '+');
}

const KEY_DISPLAY: Record<string, string> = {
  enter: '↵',
  escape: 'Esc',
  esc: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  delete: 'Del',
  tab: 'Tab',
  space: 'Space',
  home: 'Home',
  end: 'End',
};

// ─── Event matching ──────────────────────────────────────────────────────────

// Characters that are produced by pressing Shift on standard layouts.
// When the combo key is one of these, we ignore the shiftKey mismatch
// because shift is inherent in producing the character itself.
// NOTE: Uppercase A-Z are intentionally EXCLUDED so that a plain `j` combo
// does NOT swallow Shift+j — allowing explicit Shift+<letter> combos to work.
const SHIFT_PRODUCED_CHARS = new Set(
  '~!@#$%^&*()_+{}|:"<>?'.split(''),
);

/** Check whether a KeyboardEvent matches a parsed combo. */
export function matchesCombo(e: KeyboardEvent, combo: ParsedCombo): boolean {
  const keyMatch = e.key.toLowerCase() === combo.key || e.code.toLowerCase() === combo.key;

  const ctrl = e.ctrlKey === combo.modifiers.has('ctrl');
  const alt = e.altKey === combo.modifiers.has('alt');
  const meta = e.metaKey === combo.modifiers.has('meta');

  // For keys that inherently require Shift (e.g. ? = Shift+/), don't
  // require the combo to explicitly declare Shift — just check that the
  // key character itself matches.
  const shiftProduced = SHIFT_PRODUCED_CHARS.has(e.key) && !combo.modifiers.has('shift');
  const shift = shiftProduced || (e.shiftKey === combo.modifiers.has('shift'));

  return keyMatch && ctrl && alt && shift && meta;
}

/**
 * Quick check: does the event match a raw combo string?  Convenience wrapper
 * around {@link parseCombo} + {@link matchesCombo}.
 */
export function eventMatchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  return matchesCombo(e, parseCombo(shortcut));
}

// ─── Input / Focus context helpers ───────────────────────────────────────────

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Returns `true` when the active element is a text-editable field. */
export function isEditableElement(el?: Element | null): boolean {
  if (!el) return false;
  if (INPUT_TAGS.has(el.tagName)) return true;
  const htmlEl = el as HTMLElement;
  if (htmlEl.isContentEditable) return true;
  // Also check the contentEditable property/attribute directly (jsdom compat)
  if (htmlEl.contentEditable === 'true') return true;
  if (htmlEl.getAttribute?.('contenteditable') === 'true') return true;
  return false;
}

/** Should single-letter (vim-style) shortcuts be suppressed? */
export function shouldSuppressSingleKey(): boolean {
  return isEditableElement(document.activeElement);
}

/**
 * Check whether a keyboard event originated from an editable target or from
 * an element (or ancestor) marked with `data-keyboard-ignore`.  Use this in
 * the global keydown handler instead of `shouldSuppressSingleKey()` for
 * accurate target-based detection (especially in the capture phase).
 */
export function isEditableTarget(e: KeyboardEvent): boolean {
  const target = e.target as Element | null;
  if (!target) return false;
  if (isEditableElement(target)) return true;
  // Walk up to check for data-keyboard-ignore
  let el: Element | null = target;
  while (el) {
    if ((el as HTMLElement).dataset?.keyboardIgnore !== undefined) return true;
    el = el.parentElement;
  }
  return false;
}

// ─── Chorded key state machine ───────────────────────────────────────────────

export type ChordCallback = () => void;

export interface ChordDef {
  /** e.g. `['g', 'g']` for the `gg` chord */
  sequence: string[];
  callback: ChordCallback;
}

/**
 * Tiny state machine that tracks an in-progress chord.
 * Call `feed(key)` on each keydown; it returns `true` when a chord fires.
 */
export class ChordMachine {
  private defs: ChordDef[] = [];
  private buffer: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timeout = 500; // ms to wait between keypresses

  constructor(defs: ChordDef[], timeout = 500) {
    this.defs = defs;
    this.timeout = timeout;
  }

  feed(key: string): boolean {
    if (this.timer) clearTimeout(this.timer);
    this.buffer.push(key.toLowerCase());

    // Check for a complete match
    for (const def of this.defs) {
      if (
        this.buffer.length === def.sequence.length &&
        this.buffer.every((k, i) => k === def.sequence[i])
      ) {
        this.reset();
        def.callback();
        return true;
      }
    }

    // If no definition could start with the current buffer, reset
    const couldMatch = this.defs.some((d) =>
      this.buffer.every((k, i) => i < d.sequence.length && k === d.sequence[i]),
    );

    if (!couldMatch) {
      this.reset();
      return false;
    }

    // Set a timeout to auto-reset if the next key doesn't come in time
    this.timer = setTimeout(() => this.reset(), this.timeout);
    return false;
  }

  reset(): void {
    this.buffer = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  updateDefs(defs: ChordDef[]): void {
    this.defs = defs;
    this.reset();
  }
}

// ─── Shortcut registry types ─────────────────────────────────────────────────

export type KeyboardContextName =
  | 'global'
  | 'vault-list'
  | 'publication-list'
  | 'publication-table'
  | 'dialog'
  | 'search'
  | 'editor'
  | 'export';

/** Priority determines which context gets first crack at an event. Higher = first. */
export const CONTEXT_PRIORITY: Record<KeyboardContextName, number> = {
  dialog: 100,
  search: 90,
  export: 80,
  editor: 70,
  'publication-list': 50,
  'publication-table': 50,
  'vault-list': 40,
  global: 0,
};

export interface ShortcutDef {
  /** Human-readable combo or single key, e.g. `"Ctrl+S"`, `"j"`, `"?"`. */
  combo: string;
  /** Description for the help overlay. */
  description: string;
  /** Which context this shortcut belongs to. */
  context: KeyboardContextName;
  /** The handler to invoke. Return `true` to stop propagation to lower-priority contexts. */
  handler: (e: KeyboardEvent) => boolean | void;
  /** If true, this shortcut works even when text input is focused. Default: false. */
  allowInInput?: boolean;
}

// ─── Shortcut map for help overlay ───────────────────────────────────────────

import kbdConfig, { getShortcut, getCombo, getDisplayCombo } from '@/config/kbd.config';
export { getShortcut, getCombo, getDisplayCombo };

export interface ShortcutHelpItem {
  combo: string;
  description: string;
}

export interface ShortcutHelpGroup {
  context: string;
  label: string;
  shortcuts: ShortcutHelpItem[];
}

/** Human-readable labels for each context group. */
const CONTEXT_LABELS: Record<string, string> = {
  global: 'Global',
  'vault-list': 'Vault List',
  'publication-list': 'Publication List',
  dialog: 'Dialogs / Modals',
  editor: 'Notes Editor',
  export: 'Export',
};

/**
 * Derive the help overlay data from the global kbd config so there's a single
 * source of truth.  Keeps the same shape consumed by `KeyboardHelpOverlay`.
 */
function buildShortcutHelp(): ShortcutHelpGroup[] {
  return (Object.entries(kbdConfig) as [string, Record<string, { combo: string; description: string }>][]).map(
    ([context, shortcuts]) => ({
      context,
      label: CONTEXT_LABELS[context] ?? context,
      shortcuts: Object.values(shortcuts).map((s) => ({
        combo: s.combo,
        description: s.description,
      })),
    }),
  );
}

export const SHORTCUT_HELP: ShortcutHelpGroup[] = buildShortcutHelp();
