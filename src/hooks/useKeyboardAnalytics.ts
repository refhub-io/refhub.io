/**
 * Analytics hook for keyboard navigation events.
 *
 * Registers a listener on the KeyboardContext analytics callback and logs
 * `keyboard_shortcut_used` events.  The actual analytics transport is
 * pluggable — by default it uses `console.debug` in development and is a
 * no-op in production.  Replace `emit` with your analytics provider's
 * track function (e.g. PostHog, Amplitude, etc.).
 */

import { useEffect } from 'react';
import { useKeyboardContext, KeyboardAnalyticsEvent } from '@/contexts/KeyboardContext';
import { debug } from '@/lib/logger';

/** Override this to plug in your real analytics provider. */
function emit(event: KeyboardAnalyticsEvent) {
  debug('KeyboardAnalytics', 'keyboard_shortcut_used', {
    shortcut: event.shortcut,
    context: event.context,
    timestamp: event.timestamp,
  });
}

/**
 * Mount this hook once (e.g. in App or a layout component) to start
 * tracking keyboard shortcut usage.
 */
export function useKeyboardAnalytics() {
  const { onAnalytics } = useKeyboardContext();

  useEffect(() => {
    return onAnalytics(emit);
  }, [onAnalytics]);
}
