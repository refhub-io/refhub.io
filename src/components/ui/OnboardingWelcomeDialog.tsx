import { BookOpen, CheckCircle2, FolderOpen, Search, Share2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface OnboardingWelcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenGuide: () => void;
}

const ORIENTATION_ITEMS = [
  {
    icon: FolderOpen,
    title: 'Create vaults',
    description: 'Group papers by project, survey, topic, lab, or reading list.',
  },
  {
    icon: Search,
    title: 'Import and discover',
    description: 'Add papers by DOI, BibTeX, URL, existing papers, PDFs, or Semantic Scholar discovery.',
  },
  {
    icon: Share2,
    title: 'Share when ready',
    description: 'Keep vaults private, invite collaborators, or publish them to the Codex.',
  },
];

export function OnboardingWelcomeDialog({ open, onOpenChange, onOpenGuide }: OnboardingWelcomeDialogProps) {
  const handleOpenGuide = () => {
    onOpenGuide();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg overflow-hidden border-primary/20 bg-card/95 p-0 shadow-2xl shadow-primary/10 backdrop-blur-xl sm:rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <DialogTitle className="font-mono text-2xl font-bold">
            welcome_to_<span className="text-gradient">refhub</span>()
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            RefHub helps you collect papers, organize them into vaults, and share curated research context.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 py-5">
          {ORIENTATION_ITEMS.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/70 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}

          <div className="flex items-start gap-2 rounded-xl bg-primary/10 p-3 text-xs text-primary">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This welcome can be dismissed. You can always reopen the full guide from the <span className="font-mono">?</span> help button.
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border/60 bg-muted/20 px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="font-mono" onClick={() => onOpenChange(false)}>
            skip
          </Button>
          <Button variant="glow" className="font-mono" onClick={handleOpenGuide}>
            <BookOpen className="mr-2 h-4 w-4" />
            open_guide
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
