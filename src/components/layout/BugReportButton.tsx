import { useEffect, useState } from 'react';
import { ArrowUp, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { version } from '../../../package.json';

export function BugReportButton() {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      const threshold = Math.max(window.innerHeight * 0.75, 480);
      setShowScrollTop(window.scrollY > threshold);
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);

    return () => {
      window.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
    };
  }, []);

  const handleBugReport = () => {
    window.open('https://github.com/velitchko/refhub.io/issues/new?template=bug_report.md', '_blank', 'noopener,noreferrer');
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      <div className="relative flex flex-col items-end gap-2 pointer-events-auto">
        <Button
          onClick={handleScrollToTop}
          size="icon"
          variant="outline"
          className={cn(
            'absolute bottom-[calc(100%+0.75rem)] right-0 h-11 w-11 rounded-full border-primary/30 bg-background/95 shadow-lg backdrop-blur-sm transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 hover:shadow-xl',
            showScrollTop
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-2 opacity-0',
          )}
          title="Scroll back to top"
          aria-label="Scroll back to top"
        >
          <ArrowUp className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Badge
          variant="outline"
          className="gap-1 border-primary/30 bg-background/95 font-mono text-xs text-primary backdrop-blur-sm animate-pulse"
        >
          <span className="text-[10px]">v{version}</span>
        </Badge>
        <Button
          onClick={handleBugReport}
          size="icon"
          variant="outline"
          className="group h-11 w-11 rounded-full border-primary/30 bg-background/95 shadow-lg backdrop-blur-sm transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 hover:shadow-xl"
          title="Report a bug or request a feature"
          aria-label="Report a bug or request a feature"
        >
          <Bug className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
        </Button>
      </div>
    </div>
  );
}
