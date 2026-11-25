import { useEffect, useState } from 'react';

// Tracks the `dark` class on <html>, which is what ThemeToggle flips (see
// src/components/layout/ThemeToggle.tsx) - there is no shared theme context
// to read from yet, so this watches the DOM directly via MutationObserver.
export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains('dark'));
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
