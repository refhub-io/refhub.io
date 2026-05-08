import { Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function BugReportButton() {
  const handleBugReport = () => {
    const issueUrl = new URL('https://github.com/velitchko/refhub.io/issues/new');
    issueUrl.searchParams.set('template', 'bug_report.md');
    issueUrl.searchParams.set(
      'body',
      [
        '**App version**',
        `v${__APP_VERSION__}`,
        '',
        '**Describe the bug**',
        'A clear and concise description of what the bug is.',
      ].join('\n'),
    );

    window.open(issueUrl.toString(), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      <div className="flex flex-col items-end gap-2 pointer-events-auto">
        <Badge
          variant="outline"
          className="gap-1 border-primary/30 bg-background/95 font-mono text-xs text-primary backdrop-blur-sm animate-pulse"
        >
          <span className="text-[10px]">v{__APP_VERSION__}</span>
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
