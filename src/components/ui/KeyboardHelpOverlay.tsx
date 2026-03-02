import { useState, useCallback } from 'react';
import { useKeyboardContext } from '@/contexts/KeyboardContext';
import { useHotkeys } from '@/hooks/useKeyboardNavigation';
import { SHORTCUT_HELP, formatCombo } from '@/lib/keyboard';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Copy, Check, Keyboard, Terminal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * Cheatsheet-style keyboard shortcuts overlay.
 * Multi-column grid with grouped card panels, gradient accents, and
 * JetBrains Mono / refhub code aesthetic.
 */
export function KeyboardHelpOverlay() {
  const { helpOverlayOpen, setHelpOverlayOpen, enabled, setEnabled } = useKeyboardContext();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Register the ? shortcut globally to toggle the overlay
  useHotkeys(
    'global',
    [
      {
        combo: '?',
        description: 'Toggle keyboard help overlay',
        handler: () => {
          setHelpOverlayOpen(!helpOverlayOpen);
          return true;
        },
      },
    ],
    [helpOverlayOpen, setHelpOverlayOpen],
  );

  const handleCopy = useCallback(async () => {
    const text = SHORTCUT_HELP.map(
      (group) =>
        `## ${group.label}\n` +
        group.shortcuts
          .map((s) => `  ${s.combo.padEnd(20)} ${s.description}`)
          .join('\n'),
    ).join('\n\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: 'Shortcuts copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  }, [toast]);

  return (
    <Dialog open={helpOverlayOpen} onOpenChange={setHelpOverlayOpen}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 gap-0 border-primary/20 shadow-2xl shadow-primary/10">
        {/* ── Header ────────────────────────────────────────────── */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-mono flex items-center gap-2.5 text-base">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-md glow-purple">
                <Terminal className="w-4 h-4 text-white" />
              </div>
              <span>
                <span className="text-gradient">keyboard</span>
                <span className="text-muted-foreground">_shortcuts()</span>
              </span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                {copied ? (
                  <Check className="w-3 h-3 mr-1 text-accent" />
                ) : (
                  <Copy className="w-3 h-3 mr-1" />
                )}
                {copied ? 'copied!' : 'copy_all'}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* ── Shortcut grid ─────────────────────────────────────── */}
        <ScrollArea className="max-h-[60vh]">
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            {SHORTCUT_HELP.map((group) => (
              <div
                key={group.context}
                className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden"
              >
                {/* Group header */}
                <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary font-mono flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gradient-primary shadow-sm" />
                    {group.label}
                  </h3>
                </div>

                {/* Shortcut rows */}
                <div className="px-3 py-2 space-y-0.5">
                  {group.shortcuts.map((shortcut, idx) => (
                    <div
                      key={`${shortcut.combo}-${idx}`}
                      className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/40 transition-colors group"
                    >
                      <span className="text-xs text-foreground/70 group-hover:text-foreground/90 transition-colors truncate mr-3">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {shortcut.combo.split(' / ').map((combo, i) => (
                          <span key={combo} className="inline-flex items-center gap-0.5">
                            {i > 0 && (
                              <span className="text-muted-foreground/30 mx-0.5 text-[10px]">
                                /
                              </span>
                            )}
                            {combo.split(' ').map((part, j) => (
                              <kbd
                                key={`${combo}-${j}`}
                                className={cn(
                                  'inline-flex items-center justify-center rounded-md border font-mono select-none',
                                  'bg-background/80 border-border/80 text-foreground/80',
                                  'shadow-[0_1px_0_1px_rgba(0,0,0,0.15),inset_0_0.5px_0_rgba(255,255,255,0.05)]',
                                  'min-w-[1.4rem] h-[1.4rem] px-1.5 text-[10px] leading-none',
                                )}
                              >
                                {part.length <= 3 ? part : formatCombo(part)}
                              </kbd>
                            ))}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-border/60 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Label htmlFor="kbd-toggle" className="text-xs text-muted-foreground font-mono cursor-pointer">
                enable_shortcuts
              </Label>
              <Switch
                id="kbd-toggle"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
            <p className="text-[10px] text-muted-foreground/40 font-mono hidden sm:block">
              {'// press '}
              <kbd className="inline-flex items-center justify-center rounded border border-border/60 bg-background/60 font-mono px-1 text-[9px] mx-0.5 shadow-sm">?</kbd>
              {' to toggle \u2022 edit '}
              <span className="text-primary/60">kbd.config.ts</span>
              {' to remap'}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Small trigger button for the header area.
 * Opens the keyboard shortcuts overlay on click.
 */
export function KeyboardShortcutsButton({ className }: { className?: string }) {
  const { setHelpOverlayOpen } = useKeyboardContext();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setHelpOverlayOpen(true)}
      title="Keyboard shortcuts (?)"
      className={cn('h-9 w-9 text-muted-foreground hover:text-primary relative group', className)}
    >
      <Keyboard className="w-4 h-4" />
      <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-mono text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
        ?
      </span>
    </Button>
  );
}
