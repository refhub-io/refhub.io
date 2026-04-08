import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, Puzzle, ExternalLink } from 'lucide-react';

const EXTENSION_LINKS = {
  chrome: 'https://chromewebstore.google.com/detail/refhub-ext/ggoophlbadcgkmcpnbnfjacknccpkmgc',
  firefox: 'https://addons.mozilla.org/en-US/firefox/addon/refhub/',
  repo: 'https://github.com/refhub-io/refhub-extensions',
} as const;

type SupportedBrowser = 'chrome' | 'firefox';

function detectBrowser(): SupportedBrowser | 'edge' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('Firefox/')) return 'firefox';
  if (ua.includes('Chrome/')) return 'chrome';
  return 'other';
}

export function BrowserExtensionInstallCard() {
  const browser = detectBrowser();
  // Edge supports Chrome extensions
  const installTarget: SupportedBrowser | null =
    browser === 'chrome' || browser === 'edge' ? 'chrome' :
    browser === 'firefox' ? 'firefox' :
    null;

  return (
    <Card className="border border-primary/20 bg-primary/5 overflow-hidden">
      <CardContent className="p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Puzzle className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <Badge variant="outline" className="font-mono text-[10px] tracking-wide text-primary/90 py-0">
                  // browser_extension
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground py-0">
                  current_tab → refhub
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono line-clamp-1">
                save papers from the page you are{' '}
                <span className="text-gradient-green">already reading</span>
                {' '}— install from the browser store or view the extension repo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {installTarget ? (
              <Button asChild variant="glow" size="sm" className="font-mono text-xs h-7">
                <a href={EXTENSION_LINKS[installTarget]} target="_blank" rel="noreferrer">
                  <Download className="h-3 w-3" />
                  install for {browser === 'edge' ? 'edge' : installTarget}
                </a>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" size="sm" className="font-mono text-xs h-7">
                  <a href={EXTENSION_LINKS.chrome} target="_blank" rel="noreferrer">
                    <Download className="h-3 w-3" />
                    chrome
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm" className="font-mono text-xs h-7">
                  <a href={EXTENSION_LINKS.firefox} target="_blank" rel="noreferrer">
                    <Download className="h-3 w-3" />
                    firefox
                  </a>
                </Button>
              </>
            )}
            <Button asChild variant="ghost" size="sm" className="font-mono text-xs h-7 text-muted-foreground px-2">
              <a href={EXTENSION_LINKS.repo} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
