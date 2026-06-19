import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';

const STORAGE_KEY_PREFIX = 'refhub_onboarding_welcome_dismissed_v1';

function getStorageKey(userId: string): string {
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

export function useOnboarding(user: User | null, authLoading: boolean) {
  const [open, setOpen] = useState(false);
  const storageKey = useMemo(() => (user ? getStorageKey(user.id) : null), [user]);

  useEffect(() => {
    if (authLoading) return;

    if (!storageKey) {
      setOpen(false);
      return;
    }

    setOpen(!hasDismissedOnboarding(storageKey));
  }, [authLoading, storageKey]);

  const dismiss = useCallback(() => {
    if (storageKey) {
      persistDismissed(storageKey);
    }
    setOpen(false);
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
