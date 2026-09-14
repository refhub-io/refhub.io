import { useEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeyboardProvider, useKeyboardContext } from '@/contexts/KeyboardContext';
import { useKeyboardNavigation, useDialogKeyboardContext } from './useKeyboardNavigation';

function pressCtrl(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe('useKeyboardNavigation app-wide Ctrl shortcuts', () => {
  // Regression test: Ctrl+A/Ctrl+D/Ctrl+E were registered without `appWide`,
  // unlike their sibling shortcuts (v, Shift+g, j, k) in the same hotkey list.
  // That meant they only fired once this hook's own `context` was the active
  // one -- e.g. before activateOnMount's effect has run, or while a sibling
  // list/dialog holds the active context -- so the browser's own Ctrl+A
  // (select page text) / Ctrl+E ran instead, even though the UI advertises
  // these as working shortcuts via <KbdHint>.
  it('lets Ctrl+A select all and calls preventDefault even when this context is not yet the active one', () => {
    const { result } = renderHook(
      () =>
        useKeyboardNavigation({
          context: 'publication-list',
          itemIds: ['a', 'b', 'c'],
          appWideShortcuts: true,
        }),
      { wrapper: KeyboardProvider },
    );

    // No activateOnMount/bootstrapOnNav here, so the active context is still 'global'.
    expect(result.current.selectedIds.size).toBe(0);

    const event = pressCtrl('a');

    expect(event.defaultPrevented).toBe(true);
    expect(result.current.selectedIds).toEqual(new Set(['a', 'b', 'c']));
  });

  it('lets Ctrl+D clear the selection app-wide too', () => {
    const { result } = renderHook(
      () =>
        useKeyboardNavigation({
          context: 'publication-list',
          itemIds: ['a', 'b'],
          appWideShortcuts: true,
        }),
      { wrapper: KeyboardProvider },
    );

    pressCtrl('a');
    expect(result.current.selectedIds.size).toBe(2);

    const event = pressCtrl('d');
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('lets Ctrl+E invoke onExport app-wide, defaulting to every item when nothing is selected', () => {
    const exported: string[][] = [];
    const onExport = (ids: string[]) => exported.push(ids);

    renderHook(
      () =>
        useKeyboardNavigation({
          context: 'publication-list',
          itemIds: ['a', 'b'],
          appWideShortcuts: true,
          onExport,
        }),
      { wrapper: KeyboardProvider },
    );

    const event = pressCtrl('e');
    expect(event.defaultPrevented).toBe(true);
    expect(exported).toEqual([['a', 'b']]);
  });

  it('does not fire Ctrl+A when appWideShortcuts is not set and this context is inactive (scoped lists stay scoped)', () => {
    const { result } = renderHook(
      () =>
        useKeyboardNavigation({
          context: 'publication-list',
          itemIds: ['a', 'b', 'c'],
        }),
      { wrapper: KeyboardProvider },
    );

    const event = pressCtrl('a');
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });
});

describe('useDialogKeyboardContext', () => {
  // Simulates a page that pushes its own context once on mount (e.g. Inbox's
  // page-scoped useEffect(() => kb.pushContext('inbox'), [])) with a dialog
  // mounted alongside it, starting closed -- exactly the Inbox.tsx +
  // VaultDialog/ProfileDialog arrangement.
  function usePageWithDialog(open: boolean) {
    const kb = useKeyboardContext();
    useEffect(() => {
      kb.pushContext('inbox');
      return () => kb.popContext();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useDialogKeyboardContext(open, 'dialog');
    return kb;
  }

  // Regression test: the inline `useEffect(() => { if (open) {push} else
  // {pop} }, [open])` pattern this hook replaces ran its "else" branch on
  // the dialog's very first mount too, since `open` is always a dependency
  // -- so a dialog that starts out closed immediately popped a context it
  // never pushed. On a page whose own context-push is a one-time mount
  // effect with nothing to re-assert it, that silently left every keyboard
  // shortcut on the page dead with no visible symptom pointing at why.
  it('does not pop the context stack on initial mount while the dialog starts closed', () => {
    const { result } = renderHook(({ open }) => usePageWithDialog(open), {
      wrapper: KeyboardProvider,
      initialProps: { open: false },
    });

    expect(result.current.activeContext).toBe('inbox');
  });

  it('pushes on open and pops back to the prior context on close', () => {
    const { result, rerender } = renderHook(({ open }) => usePageWithDialog(open), {
      wrapper: KeyboardProvider,
      initialProps: { open: false },
    });
    expect(result.current.activeContext).toBe('inbox');

    rerender({ open: true });
    expect(result.current.activeContext).toBe('dialog');

    rerender({ open: false });
    expect(result.current.activeContext).toBe('inbox');
  });
});
