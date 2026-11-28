let activeSwitches = 0;

/**
 * Switches between light and dark as one smooth crossfade.
 *
 * Flipping the `dark` class restyles every element at once, and the hundreds of elements with
 * their own color transitions then animated separately, a frame-by-frame restyle that stuttered
 * on ordinary hardware. Where the browser supports view transitions, it now snapshots the page
 * before and after and crossfades the two on the compositor. Without that support, or when the
 * user prefers reduced motion, the switch is instant.
 *
 * Either way, element transitions are off from just before the switch until it has finished (the
 * `theme-switching` class in index.css). Measured against turning them back on mid-crossfade,
 * this costs less: the new snapshot is live, so restyling during the crossfade repaints the page.
 *
 * `updateUi` runs in the same update as the class change, so the toggle's own icon is part of
 * the new snapshot.
 */
export function switchTheme(isDark: boolean, updateUi: () => void = () => {}): void {
  const root = document.documentElement;
  const apply = () => {
    root.classList.toggle('dark', isDark);
    updateUi();
  };

  // Counted, so a second click during a switch can't turn transitions back on too early.
  activeSwitches += 1;
  root.classList.add('theme-switching');
  const done = () => {
    activeSwitches -= 1;
    if (activeSwitches === 0) root.classList.remove('theme-switching');
  };

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (typeof document.startViewTransition !== 'function' || reduceMotion) {
    apply();
    // Transitions stay off until the new colors have been painted once.
    requestAnimationFrame(() => requestAnimationFrame(done));
    return;
  }

  document.startViewTransition(apply).finished.then(done, done);
}
