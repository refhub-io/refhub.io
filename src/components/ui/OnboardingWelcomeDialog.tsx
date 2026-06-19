import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, FolderOpen, Search, Settings, Sparkles, Scroll, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OnboardingSpotlight } from '@/components/ui/OnboardingSpotlight';
import { cn } from '@/lib/utils';

interface OnboardingWelcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenGuide: () => void;
}

const ONBOARDING_STEPS = [
  {
    icon: FolderOpen,
    eyebrow: 'step_01',
    title: 'create vaults',
    description: 'a vault is a focused research collection for a project, survey, topic, lab, or reading list. create, manage, and share vaults from here.',
    targetHeading: '// new_vault',
    targetLabel: 'start here to create a focused research space.',
    targetSelectors: ['[data-onboarding-target="new-vault"]', '[data-onboarding-target="vaults-section"]', '[data-onboarding-target="vault-list"]'],
  },
  {
    icon: Search,
    eyebrow: 'step_02',
    title: 'import and discover',
    description: 'add papers by doi, bibtex, url, existing library item, pdf, or semantic scholar discovery.',
    targetHeading: '// add_paper',
    targetLabel: 'add papers from the main toolbar or empty state.',
    targetSelectors: ['[data-onboarding-target="add-paper"]', '[data-onboarding-target="publication-content"]'],
  },
  {
    icon: Users,
    eyebrow: 'step_03',
    title: 'researchers overview',
    description: 'browse public profiles, find people by topic, and see what vaults researchers choose to share.',
    targetHeading: '// researchers',
    targetLabel: 'open the researchers directory from the sidebar.',
    targetSelectors: ['[data-onboarding-target="researchers-link"]'],
  },
  {
    icon: Scroll,
    eyebrow: 'step_04',
    title: 'the codex',
    description: 'discover public vaults, inspect curated reading lists, and reuse context from the wider refhub network.',
    targetHeading: '// the_codex',
    targetLabel: 'the codex collects public vaults for discovery.',
    targetSelectors: ['[data-onboarding-target="codex-link"]'],
  },
  {
    icon: Settings,
    eyebrow: 'step_05',
    title: 'account and settings',
    description: 'use the sidebar controls for profile settings, theme, keyboard help, what’s new, and sign out.',
    targetHeading: '// user_controls',
    targetLabel: 'manage profile, settings, help, and account controls here.',
    targetSelectors: ['[data-onboarding-target="user-controls"]'],
  },
] as const;

export function OnboardingWelcomeDialog({ open, onOpenChange, onOpenGuide }: OnboardingWelcomeDialogProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const activeStep = ONBOARDING_STEPS[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;
  const progressLabel = useMemo(() => `${stepIndex + 1}/${ONBOARDING_STEPS.length}`, [stepIndex]);

  const handleOpenGuide = () => {
    onOpenGuide();
  };

  const handleOpenApp = () => {
    onOpenChange(false);
  };

  const handleNext = () => {
    setStepIndex((current) => Math.min(current + 1, ONBOARDING_STEPS.length - 1));
  };

  const Icon = activeStep.icon;

  return (
    <>
      <OnboardingSpotlight
        enabled={open}
        selectors={activeStep.targetSelectors}
        label={activeStep.targetLabel}
        heading={activeStep.targetHeading}
      />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          overlayClassName="bg-transparent"
          className="z-[70] w-[95vw] max-w-lg overflow-hidden border-primary/20 bg-card/95 p-0 shadow-2xl shadow-primary/10 backdrop-blur-xl sm:rounded-2xl"
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <DialogTitle className="font-mono text-2xl font-bold">
            welcome_to_<span className="text-gradient">refhub</span>()
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            refhub helps collect papers, organize vaults, and share curated research context.
          </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5">
          <div className="mb-4 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
            <span>// onboarding</span>
            <span>{progressLabel}</span>
          </div>

          <div className="rounded-2xl border border-border/60 bg-muted/20 p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/70 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] text-primary">{activeStep.eyebrow}</p>
                <h3 className="text-base font-semibold text-foreground">{activeStep.title}</h3>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{activeStep.description}</p>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2" aria-label="onboarding progress">
            {ONBOARDING_STEPS.map((step, index) => (
              <button
                key={step.eyebrow}
                type="button"
                aria-label={`go to ${step.eyebrow}`}
                aria-current={index === stepIndex ? 'step' : undefined}
                onClick={() => setStepIndex(index)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  index === stepIndex ? 'w-7 bg-primary' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50',
                )}
              />
            ))}
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-primary/10 p-3 text-xs text-primary">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              dismiss this anytime. reopen the full guide from the <span className="font-mono">?</span> help button.
            </p>
          </div>
        </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border/60 bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" className="font-mono" onClick={() => onOpenChange(false)}>
            skip
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="font-mono"
              onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
              disabled={isFirstStep}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              back
            </Button>
            {isLastStep && (
              <Button variant="outline" className="font-mono" onClick={handleOpenGuide}>
                <BookOpen className="mr-2 h-4 w-4" />
                open guide
              </Button>
            )}
            <Button variant="glow" className="font-mono" onClick={isLastStep ? handleOpenApp : handleNext}>
              {isLastStep ? (
                'open app'
              ) : (
                <>
                  next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
