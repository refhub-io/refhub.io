import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeyboardProvider } from '@/contexts/KeyboardContext';
import { useKeyboardNavigation } from './useKeyboardNavigation';

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
    const onExport = (ids: string[]) => exported.push(ids);
    const exported: string[][] = [];

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
