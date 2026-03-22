import { useState, useEffect } from 'react';
import changelog from '@/config/changelog';

const STORAGE_KEY = 'refhub_whats_new_seen';

const latest = changelog[0];

function getSeenId(): number {
  return parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);
}

export function useWhatsNew() {
  const [open, setOpen] = useState(false);
  const [hasUnseen, setHasUnseen] = useState(false);

  useEffect(() => {
    const seen = getSeenId();
    if (latest.id > seen) {
      setHasUnseen(true);
      setOpen(true);
    }
  }, []);

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
