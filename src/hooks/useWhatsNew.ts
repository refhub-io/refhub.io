import { useCallback, useEffect, useState } from 'react';
import changelog from '@/config/changelog';
import { ONBOARDING_COMPLETED_EVENT, hasUserDismissedOnboarding } from '@/hooks/useOnboarding';
import { useAuth } from '@/hooks/useAuth';
import { useKeyboardContext } from '@/contexts/KeyboardContext';

const STORAGE_KEY = 'refhub_whats_new_seen';

const latest = changelog[0];

function getSeenId(): number {
  return parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);
}

export function useWhatsNew() {
  const { user, loading } = useAuth();
  const { helpOverlayOpen } = useKeyboardContext();
  const [open, setOpen] = useState(false);
  const [hasUnseen, setHasUnseen] = useState(false);

  const maybeOpenLatest = useCallback(() => {
    if (loading || !user || helpOverlayOpen) return;

    const seen = getSeenId();
    const unseen = latest.id > seen;
    setHasUnseen(unseen);

    if (!unseen) return;

    // New users should see onboarding first, then whats_new after onboarding is dismissed.
    if (!hasUserDismissedOnboarding(user.id)) return;

    setOpen(true);
  }, [helpOverlayOpen, loading, user]);

  useEffect(() => {
    maybeOpenLatest();
  }, [maybeOpenLatest]);

  useEffect(() => {
    const handleOnboardingCompleted = () => maybeOpenLatest();
    window.addEventListener(ONBOARDING_COMPLETED_EVENT, handleOnboardingCompleted);
    return () => window.removeEventListener(ONBOARDING_COMPLETED_EVENT, handleOnboardingCompleted);
  }, [maybeOpenLatest]);

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      // Mark as seen when the dialog is closed
      localStorage.setItem(STORAGE_KEY, String(latest.id));
      setHasUnseen(false);
    }
    setOpen(value);
  };

  const openDialog = () => setOpen(true);

  return { open, hasUnseen, onOpenChange: handleOpenChange, openDialog };
}
