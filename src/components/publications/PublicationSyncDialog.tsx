import { useState, useEffect } from 'react';
import { ArrowRight, Check, X, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PublicationSyncDiff, formatSyncValue } from '@/lib/publicationSync';

interface PublicationSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diffs: PublicationSyncDiff[];
  onApply: (selectedDiffs: PublicationSyncDiff[]) => void;
  disabled?: boolean;
}

export function PublicationSyncDialog({
  open,
  onOpenChange,
  diffs,
  onApply,
  disabled,
}: PublicationSyncDialogProps) {
  const [checkedFields, setCheckedFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCheckedFields(new Set(diffs.map((d) => d.field)));
  }, [diffs]);

  const allChecked = diffs.length > 0 && checkedFields.size === diffs.length;
  const noneChecked = checkedFields.size === 0;

  const toggleAll = () => {
    setCheckedFields(allChecked ? new Set() : new Set(diffs.map((d) => d.field)));
  };

  const toggleField = (field: string) => {
    setCheckedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  const handleApply = () => {
    onApply(diffs.filter((d) => checkedFields.has(d.field)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-2 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-xl sm:text-2xl font-bold">
            // semantic_scholar_sync()
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Review incoming metadata. Notes and tags are not affected.
          </DialogDescription>
        </DialogHeader>

        {/* Select all row */}
        <div className="flex items-center gap-2 py-1.5 border-b border-border">
          <Checkbox
            id="sync-select-all"
            checked={allChecked ? true : noneChecked ? false : 'indeterminate'}
            onCheckedChange={toggleAll}
          />
          <label
            htmlFor="sync-select-all"
            className="text-xs font-mono text-muted-foreground cursor-pointer select-none"
          >
            {allChecked ? 'deselect_all' : 'select_all'}
          </label>
          <span className="ml-auto text-xs font-mono text-muted-foreground">
            {checkedFields.size}/{diffs.length}
          </span>
        </div>

        <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
          {diffs.map((diff) => {
            const checked = checkedFields.has(diff.field);
            return (
              <div
                key={diff.field}
                onClick={() => toggleField(diff.field)}
                className={`rounded-lg border p-3 cursor-pointer transition-all ${
                  checked
                    ? 'bg-muted/30 border-border'
                    : 'bg-muted/5 border-border/30 opacity-40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleField(diff.field)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    {/* Field label */}
                    <div className="text-sm font-mono font-bold text-foreground mb-2 tracking-wide">
                      {diff.label}
                    </div>
                    {/* Three-column layout: current | arrow | incoming */}
                    <div className="grid grid-cols-[1fr_28px_1fr] gap-1 items-start text-xs">
                      <div>
                        <div className="font-mono text-neon-orange mb-1 font-semibold">current</div>
                        <div className="break-words text-neon-orange/80 leading-relaxed">
                          {formatSyncValue(diff.current)}
                        </div>
                      </div>
                      <div className="flex items-center justify-center pt-4">
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      </div>
                      <div>
                        <div className="font-mono text-neon-green mb-1 font-semibold">incoming</div>
                        <div className="break-words text-neon-green/80 leading-relaxed">
                          {formatSyncValue(diff.incoming)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="font-mono"
          >
            <X className="w-4 h-4 mr-1.5" />
            cancel
          </Button>
          <Button
            variant="glow"
            onClick={handleApply}
            disabled={disabled || noneChecked}
            className="font-mono"
          >
            <Check className="w-4 h-4 mr-1.5" />
            apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
