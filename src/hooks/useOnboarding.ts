import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';

export const ONBOARDING_COMPLETED_EVENT = 'refhub:onboarding-completed';
export const ONBOARDING_RESTART_EVENT = 'refhub:onboarding-restart-requested';
const STORAGE_KEY_PREFIX = 'refhub_onboarding_welcome_dismissed_v1';

export function getOnboardingStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function hasDismissedOnboarding(storageKey: string): boolean {
  if (typeof window === 'undefined') return true;

  try {
    return localStorage.getItem(storageKey) === 'true';
  } catch {
    return true;
  }
}

function persistDismissed(storageKey: string) {
  try {
    localStorage.setItem(storageKey, 'true');
  } catch {
    // Ignore storage failures; the dialog still closes for this session.
  }
}

export function hasUserDismissedOnboarding(userId: string): boolean {
  return hasDismissedOnboarding(getOnboardingStorageKey(userId));
}

function emitOnboardingCompleted() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ONBOARDING_COMPLETED_EVENT));
}

export function restartOnboarding() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ONBOARDING_RESTART_EVENT));
}

function hasVisibleOnboardingTarget(): boolean {
  if (typeof document === 'undefined') return false;

  const target = document.querySelector('[data-onboarding-target="new-vault"]');
  if (!(target instanceof HTMLElement)) return false;

  const rect = target.getBoundingClientRect();
  const style = window.getComputedStyle(target);

  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

export function useOnboarding(user: User | null, authLoading: boolean) {
  const [open, setOpen] = useState(false);
  const storageKey = useMemo(() => (user ? getOnboardingStorageKey(user.id) : null), [user]);

  useEffect(() => {
    if (authLoading) return undefined;

    if (!storageKey) {
      setOpen(false);
      return undefined;
    }

    if (hasDismissedOnboarding(storageKey)) {
      setOpen(false);
      return undefined;
    }

    let timeoutId = 0;
    let cancelled = false;
    let attempts = 0;

    const waitForAppShell = () => {
      if (cancelled) return;

      if (hasVisibleOnboardingTarget()) {
        setOpen(true);
        return;
      }

      attempts += 1;
      if (attempts < 80) {
        timeoutId = window.setTimeout(waitForAppShell, 125);
      }
    };

    waitForAppShell();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [authLoading, storageKey]);

  useEffect(() => {
    if (!storageKey) return undefined;

    const handleRestart = () => {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage failures; still reopen for this session.
      }
      setOpen(true);
    };

    window.addEventListener(ONBOARDING_RESTART_EVENT, handleRestart);
    return () => window.removeEventListener(ONBOARDING_RESTART_EVENT, handleRestart);
  }, [storageKey]);

  const dismiss = useCallback(() => {
    if (storageKey) {
      persistDismissed(storageKey);
    }
    setOpen(false);
    emitOnboardingCompleted();
  }, [storageKey]);

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!value) {
        dismiss();
        return;
      }
      setOpen(value);
    },
    [dismiss],
  );

  return { open, onOpenChange: handleOpenChange, dismiss };
}
