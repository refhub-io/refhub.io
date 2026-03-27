import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, Puzzle, ExternalLink } from 'lucide-react';

const EXTENSION_LINKS = {
  chrome: 'https://github.com/refhub-io/refhub-extensions/releases/latest',
  firefox: 'https://github.com/refhub-io/refhub-extensions/releases/latest',
  repo: 'https://github.com/refhub-io/refhub-extensions',
} as const;

export function BrowserExtensionInstallCard() {
  return (
    <Card className="border-border/70 bg-gradient-to-br from-background via-card to-card/95 overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary/90">
                // browser_capture
              </Badge>
              <Badge variant="outline" className="font-mono text-[11px] text-muted-foreground">
                current_tab → refhub
              </Badge>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Puzzle className="h-4 w-4 text-primary" />
                <p className="font-mono text-sm text-foreground">
                  save papers from the page you are already reading
                </p>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                The browser extension extracts page metadata, lets you choose a vault, and saves directly into RefHub.
                Store listings are not live yet, so install currently comes from the extension releases.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline" className="font-mono">
              <a href={EXTENSION_LINKS.chrome} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
                chrome
              </a>
            </Button>
            <Button asChild variant="outline" className="font-mono">
              <a href={EXTENSION_LINKS.firefox} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
                firefox
              </a>
            </Button>
            <Button asChild variant="ghost" className="font-mono text-muted-foreground">
              <a href={EXTENSION_LINKS.repo} target="_blank" rel="noreferrer">
                repo
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
