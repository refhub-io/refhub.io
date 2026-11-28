import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { switchTheme } from '@/lib/themeTransition';

export function ThemeToggle() {
  // Initialize state from localStorage to avoid hydration mismatch
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      return stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  useEffect(() => {
    // Apply theme class on mount and when it changes
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
    // The icon updates in the same step as the page, so the crossfade shows them change together.
    switchTheme(newIsDark, () => flushSync(() => setIsDark(newIsDark)));
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      title={isDark ? 'switch to light mode' : 'switch to dark mode'}
    >
      {isDark ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </Button>
  );
}
