import { useState, useEffect, useCallback, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

interface UseUnsavedChangesOptions {
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Callback to save changes before navigation */
  onSave?: () => Promise<void>;
  /** Custom message for the confirmation dialog */
  message?: string;
}

interface UseUnsavedChangesReturn {
  /** Whether the confirmation dialog should be shown */
  showConfirmDialog: boolean;
  /** Handler to confirm discarding changes */
  confirmDiscard: () => void;
  /** Handler to cancel and stay on the page */
  cancelDiscard: () => void;
  /** Handler to save and then proceed */
  saveAndProceed: () => Promise<void>;
  /** Reset the dirty state */
  resetDirty: () => void;
  /** The blocked navigation state from react-router */
  blockedNavigation: ReturnType<typeof useBlocker>;
}

/**
 * Hook to handle unsaved changes confirmation when navigating away
 * or closing dialogs. Uses React Router's useBlocker for navigation
 * and beforeunload for browser close/refresh.
 */
export function useUnsavedChanges({
  isDirty,
  onSave,
  message = 'You have unsaved changes. Are you sure you want to leave?',
}: UseUnsavedChangesOptions): UseUnsavedChangesReturn {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const isDirtyRef = useRef(isDirty);
  
  // Keep ref in sync
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  // Block navigation with React Router
  const blockedNavigation = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirtyRef.current && currentLocation.pathname !== nextLocation.pathname
  );

  // Show dialog when navigation is blocked
  useEffect(() => {
    if (blockedNavigation.state === 'blocked') {
      setShowConfirmDialog(true);
    }
  }, [blockedNavigation.state]);

  // Handle browser beforeunload event
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        // Modern browsers require returnValue to be set
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [message]);

  const confirmDiscard = useCallback(() => {
    setShowConfirmDialog(false);
    if (blockedNavigation.state === 'blocked') {
      blockedNavigation.proceed();
    }
    if (pendingNavigationRef.current) {
      pendingNavigationRef.current();
      pendingNavigationRef.current = null;
    }
  }, [blockedNavigation]);

  const cancelDiscard = useCallback(() => {
    setShowConfirmDialog(false);
    if (blockedNavigation.state === 'blocked') {
      blockedNavigation.reset();
    }
    pendingNavigationRef.current = null;
  }, [blockedNavigation]);

  const saveAndProceed = useCallback(async () => {
    if (onSave) {
      try {
        await onSave();
        confirmDiscard();
      } catch (error) {
        // If save fails, keep the dialog open
        console.error('Failed to save:', error);
      }
    } else {
      confirmDiscard();
    }
  }, [onSave, confirmDiscard]);

  const resetDirty = useCallback(() => {
    isDirtyRef.current = false;
    setShowConfirmDialog(false);
  }, []);

  return {
    showConfirmDialog,
    confirmDiscard,
    cancelDiscard,
    saveAndProceed,
    resetDirty,
    blockedNavigation,
  };
}

export default useUnsavedChanges;
