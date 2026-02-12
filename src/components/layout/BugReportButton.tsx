import { Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function BugReportButton() {
  const handleBugReport = () => {
    window.open('https://github.com/velitchko/refhub.io/issues/new?template=bug_report.md', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <Badge 
        variant="outline" 
        className="gap-1 font-mono text-xs bg-background/95 backdrop-blur-sm border-primary/30 text-primary animate-pulse"
      >
        <span className="text-[10px]">v1.1.0-beta</span>
      </Badge>
      <Button
        onClick={handleBugReport}
        size="sm"
        variant="outline"
        className="h-10 w-10 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-background/95 backdrop-blur-sm border-primary/30 hover:border-primary/50 hover:bg-primary/5 group"
        title="Report a bug or request a feature"
      >
        <Bug className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </Button>
    </div>
  );
}
