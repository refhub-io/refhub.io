import changelog, { ChangelogEntry, ChangelogTag } from '@/config/changelog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, Wrench, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TAG_CONFIG: Record<ChangelogTag, { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }> = {
  feature: {
    label: 'feature',
    className: 'bg-primary/10 text-primary border-primary/30',
    Icon: Sparkles,
  },
  improvement: {
    label: 'improvement',
    className: 'bg-accent/10 text-neon-green border-accent/30',
    Icon: Zap,
  },
  fix: {
    label: 'fix',
    className: 'bg-orange-500/10 text-neon-orange border-orange-500/30',
    Icon: Wrench,
  },
};

function EntrySection({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="font-bold font-mono text-sm text-foreground">{entry.title}</h3>
        <span className="text-xs font-mono text-muted-foreground shrink-0">{entry.date}</span>
      </div>
      <div className="space-y-3">
        {entry.features.map((feat, i) => {
          const { label, className, Icon } = TAG_CONFIG[feat.tag];
          return (
            <div key={i} className="flex gap-3">
              <Badge
                variant="outline"
                className={cn('font-mono text-xs h-5 px-1.5 shrink-0 mt-0.5 gap-1', className)}
              >
                <Icon className="w-2.5 h-2.5" />
                {label}
              </Badge>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium leading-snug">{feat.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{feat.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg flex flex-col bg-card/95 backdrop-blur-xl border-2 p-0 overflow-hidden max-h-[80vh]">
        <DialogHeader className="shrink-0 px-6 pt-5 pb-4 border-b border-border/50">
          <DialogTitle className="text-xl font-bold font-mono flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            // whats_new
          </DialogTitle>
          <DialogDescription className="font-mono text-sm text-muted-foreground">
            // recent_updates • refhub.io
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-8">
          {changelog.map((entry, i) => (
            <div key={entry.id}>
              {i > 0 && <div className="border-t border-border/50 mb-8" />}
              <EntrySection entry={entry} />
            </div>
          ))}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-border/50">
          <Button
            className="w-full font-mono"
            variant="glow"
            onClick={() => onOpenChange(false)}
          >
            got_it ✨
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
