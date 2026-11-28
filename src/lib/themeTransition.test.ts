import { afterEach, describe, expect, it, vi } from 'vitest';
import { switchTheme } from './themeTransition';

const root = document.documentElement;
const nextFrames = () => new Promise((resolve) => setTimeout(resolve, 60));
type StartViewTransition = (update: () => void) => { finished: Promise<void> };
const setStartViewTransition = (fn: StartViewTransition | undefined) => {
  Object.defineProperty(document, 'startViewTransition', { value: fn, configurable: true, writable: true });
};
const setReducedMotion = (reduce: boolean) => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'), media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }) as MediaQueryList);
};

afterEach(() => {
  vi.restoreAllMocks();
  setStartViewTransition(undefined);
  root.className = '';
});

describe('switchTheme', () => {
  it('crossfades through a view transition, with element transitions off until it ends', async () => {
    setReducedMotion(false);
    let finish: () => void = () => {};
    const start = vi.fn((update: () => void) => {
      update();
      return { finished: new Promise<void>((resolve) => { finish = resolve; }) };
    });
    setStartViewTransition(start);
    const updateUi = vi.fn();

    switchTheme(true, updateUi);

    expect(start).toHaveBeenCalledTimes(1);
    expect(updateUi).toHaveBeenCalledTimes(1);
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.classList.contains('theme-switching')).toBe(true);
    finish();
    await nextFrames();
    expect(root.classList.contains('theme-switching')).toBe(false);
  });

  it('switches at once where view transitions are missing', async () => {
    setReducedMotion(false);

    switchTheme(true);

    expect(root.classList.contains('dark')).toBe(true);
    expect(root.classList.contains('theme-switching')).toBe(true);
    await nextFrames();
    expect(root.classList.contains('theme-switching')).toBe(false);
  });

  it('switches at once when the user prefers reduced motion', () => {
    setReducedMotion(true);
    const start = vi.fn();
    setStartViewTransition(start);

    switchTheme(false);

    expect(start).not.toHaveBeenCalled();
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('keeps element transitions off until the last of two quick switches ends', async () => {
    setReducedMotion(false);
    const finishers: (() => void)[] = [];
    setStartViewTransition((update) => {
      update();
      return { finished: new Promise<void>((resolve) => finishers.push(resolve)) };
    });

    switchTheme(true);
    switchTheme(false);
    finishers[0]();
    await nextFrames();
    expect(root.classList.contains('theme-switching')).toBe(true);
    finishers[1]();
    await nextFrames();
    expect(root.classList.contains('theme-switching')).toBe(false);
    expect(root.classList.contains('dark')).toBe(false);
  });
});
