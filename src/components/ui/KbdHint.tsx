import { ReactNode } from 'react';
import { formatCombo, isMac } from '@/lib/keyboard';
import { cn } from '@/lib/utils';

interface KbdHintProps {
  /** The shortcut combo string, e.g. "Meta+K", "j", "Ctrl+S". Can also be an array for multiple alternatives. */
  shortcut: string | string[];
  /** Optional children to render alongside the kbd hint. */
  children?: ReactNode;
  /** Additional class names for the outer wrapper. */
  className?: string;
  /** Size variant. */
  size?: 'sm' | 'md';
}

/**
 * Renders an accessible <kbd>-style hint for a keyboard shortcut.
 *
 * Usage:
 * ```tsx
 * <KbdHint shortcut="Meta+K" />
 * <KbdHint shortcut={["j", "k"]} />
 * ```
 */
export function KbdHint({ shortcut, children, className, size = 'sm' }: KbdHintProps) {
  const combos = Array.isArray(shortcut) ? shortcut : [shortcut];

  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-hidden="false">
      {children}
      {combos.map((combo, i) => (
        <span key={combo} className="inline-flex items-center gap-0.5">
          {i > 0 && <span className="text-muted-foreground/50 mx-0.5">/</span>}
          <kbd
            className={cn(
              'inline-flex items-center justify-center rounded border border-border bg-muted/60 font-mono text-muted-foreground select-none',
              'shadow-[0_1px_0_1px_rgba(0,0,0,0.04)]',
              size === 'sm' && 'min-w-[1.25rem] h-5 px-1 text-[10px] leading-none',
              size === 'md' && 'min-w-[1.5rem] h-6 px-1.5 text-xs leading-none',
            )}
            title={combo}
          >
            {formatCombo(combo)}
          </kbd>
        </span>
      ))}
    </span>
  );
}

/**
 * A compact keyboard hint footer for lists.
 * Shows common navigation shortcuts in a single line.
 */
export function KbdFooterHint({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-3 py-2 text-[10px] text-muted-foreground/60 font-mono select-none',
        className,
      )}
      aria-label="Keyboard navigation hints"
    >
      <span className="inline-flex items-center gap-1">
        Navigate: <KbdHint shortcut={['j', 'k']} size="sm" />
      </span>
      <span className="text-muted-foreground/30">•</span>
      <span className="inline-flex items-center gap-1">
        Select: <KbdHint shortcut="Space" size="sm" />
      </span>
      <span className="text-muted-foreground/30">•</span>
      <span className="inline-flex items-center gap-1">
        Open: <KbdHint shortcut="Enter" size="sm" />
      </span>
      <span className="text-muted-foreground/30">•</span>
      <span className="inline-flex items-center gap-1">
        Help: <KbdHint shortcut="?" size="sm" />
      </span>
    </div>
  );
}
