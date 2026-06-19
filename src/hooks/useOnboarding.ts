import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'refhub_onboarding_welcome_dismissed_v1';

function hasDismissedOnboarding(): boolean {
  if (typeof window === 'undefined') return true;

  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return true;
  }
}

function persistDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Ignore storage failures; the dialog still closes for this session.
  }
}

export function useOnboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasDismissedOnboarding()) {
      setOpen(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    persistDismissed();
    setOpen(false);
  }, []);

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
