import { Circle, CircleDot, CircleCheck, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Publication } from '@/types/database';

type ReadingState = Publication['reading_state'];

const READING_STATES: { value: ReadingState; label: string; Icon: typeof Circle; activeClass: string }[] = [
  { value: 'unread', label: 'unread', Icon: Circle, activeClass: 'text-muted-foreground' },
  { value: 'skimmed', label: 'skimmed', Icon: CircleDot, activeClass: 'text-cyber-blue' },
  { value: 'read', label: 'read', Icon: CircleCheck, activeClass: 'text-neon-green' },
];

interface ReadingProgressControlProps {
  value: ReadingState;
  onChange?: (value: ReadingState) => void;
  className?: string;
}

/** One-click segmented control: each icon jumps straight to that state, no cycling. */
export function ReadingProgressControl({ value, onChange, className }: ReadingProgressControlProps) {
  const readOnly = !onChange;

  return (
    <div className={cn('inline-flex items-center rounded-md border border-border overflow-hidden shrink-0', className)}>
      {READING_STATES.map(({ value: stateValue, label, Icon, activeClass }) => {
        const isActive = value === stateValue;
        return (
          <button
            key={stateValue}
            type="button"
            disabled={readOnly}
            onClick={(e) => {
              e.stopPropagation();
              onChange?.(stateValue);
            }}
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            className={cn(
              'flex items-center justify-center h-7 w-7 transition-colors',
              isActive ? cn('bg-muted', activeClass) : 'text-muted-foreground/40',
              !readOnly && !isActive && 'hover:text-foreground hover:bg-muted/50',
              readOnly && 'cursor-default',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
}

interface ImportantToggleProps {
  value: boolean;
  onChange?: (value: boolean) => void;
  className?: string;
}

/** Star toggle, orthogonal to reading progress. */
export function ImportantToggle({ value, onChange, className }: ImportantToggleProps) {
  const readOnly = !onChange;

  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!value);
      }}
      title={value ? 'important' : 'mark_important'}
      aria-label={value ? 'important' : 'mark_important'}
      aria-pressed={value}
      className={cn(
        'flex items-center justify-center h-7 w-7 rounded-md border transition-colors shrink-0',
        value ? 'text-neon-orange border-neon-orange/40 bg-neon-orange/10' : 'text-muted-foreground/40 border-border',
        !readOnly && !value && 'hover:text-neon-orange hover:border-neon-orange/40',
        readOnly && 'cursor-default',
        className,
      )}
    >
      <Star className={cn('w-3.5 h-3.5', value && 'fill-current')} />
    </button>
  );
}
