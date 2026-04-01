import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      const threshold = Math.max(window.innerHeight * 0.75, 480);
      setIsVisible(window.scrollY > threshold);
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);

    return () => {
      window.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
    };
  }, []);

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="pointer-events-none fixed bottom-[calc(1rem+4.75rem)] right-4 z-40 sm:bottom-[calc(1.5rem+4.75rem)] sm:right-6">
      <Button
        onClick={handleScrollToTop}
        size="icon"
        variant="outline"
        className={cn(
          'pointer-events-auto h-11 w-11 rounded-full border-primary/30 bg-background/95 shadow-lg backdrop-blur-sm transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 hover:shadow-xl',
          isVisible
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-2 opacity-0',
        )}
        title="Scroll back to top"
        aria-label="Scroll back to top"
      >
        <ArrowUp className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}
