import { useMemo, useState } from 'react';
import { ArrowLeft, GitMerge, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  DUPE_PRESETS,
  type DupeCandidate,
  type DupeHeuristicConfig,
  type DupePresetName,
  type DupeSignal,
  findDuplicateCandidates,
} from '@/lib/dupeDetection';
import {
  buildMergePlan,
  executeMergePlan,
  listFieldConflicts,
  listVaultConflicts,
  type Side,
  type VaultCopyRef,
} from '@/lib/dupeMerge';
import { useToast } from '@/hooks/use-toast';
import type { BibliographicField } from '@/lib/publicationSync';
import type { Publication, Vault } from '@/types/database';

export interface DuplicateCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publications: Publication[];
  vaults: Vault[];
  vaultCopies: VaultCopyRef[];
  onMergeComplete: () => void;
}

type WizardStep = 'configure' | 'review' | 'resolve';

const SIGNAL_LABELS: Record<DupeSignal, string> = {
  title: 'title_similarity',
  authors: 'author_overlap',
  year: 'year_match',
  venue: 'venue_similarity',
};

const pairKey = (c: DupeCandidate<Publication>) => [c.left.id, c.right.id].sort().join(':');

const fieldValueLabel = (value: unknown): string => {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
};

export function DuplicateCheckDialog({
  open,
  onOpenChange,
  publications,
  vaults,
  vaultCopies,
  onMergeComplete,
}: DuplicateCheckDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>('configure');
  const [config, setConfig] = useState<DupeHeuristicConfig>(DUPE_PRESETS.balanced);
  const [candidates, setCandidates] = useState<DupeCandidate<Publication>[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<DupeCandidate<Publication> | null>(null);
  const [survivor, setSurvivor] = useState<Side>('left');
  const [fieldChoices, setFieldChoices] = useState<Partial<Record<BibliographicField, Side>>>({});
  const [vaultChoices, setVaultChoices] = useState<Record<string, Side>>({});
  const [merging, setMerging] = useState(false);

  const originals = useMemo(
    () => publications.filter((p) => !p.original_publication_id),
    [publications],
  );

  const vaultNames = useMemo(() => new Map(vaults.map((v) => [v.id, v.name])), [vaults]);

  const visibleCandidates = candidates.filter((c) => !dismissed.has(pairKey(c)));

  const runScan = () => {
    setCandidates(findDuplicateCandidates(originals, config));
    setDismissed(new Set());
    setStep('review');
  };

  const openResolve = (candidate: DupeCandidate<Publication>) => {
    setActive(candidate);
    // default survivor: the older row
    setSurvivor(candidate.left.created_at <= candidate.right.created_at ? 'left' : 'right');
    setFieldChoices({});
    setVaultChoices({});
    setStep('resolve');
  };

  const updateSignal = (signal: DupeSignal, patch: Partial<{ enabled: boolean; weight: number }>) => {
    setConfig((prev) => ({
      ...prev,
      signals: { ...prev.signals, [signal]: { ...prev.signals[signal], ...patch } },
    }));
  };

  const applyPreset = (name: DupePresetName) => setConfig(DUPE_PRESETS[name]);

  const handleMerge = async (overrideChoices?: Partial<Record<BibliographicField, Side>>) => {
    if (!active) return;
    setMerging(true);
    try {
      const plan = buildMergePlan(active.left, active.right, vaultCopies, {
        survivor,
        fieldChoices: overrideChoices ?? fieldChoices,
        vaultChoices,
      });
      await executeMergePlan(plan);
      toast({
        title: 'Papers merged',
        description: `Kept "${(survivor === 'left' ? active.left : active.right).title}"; re-pointed ${plan.repointCopyIds.length} vault ${plan.repointCopyIds.length === 1 ? 'copy' : 'copies'}.`,
      });
      // drop every remaining candidate touching the deleted paper
      const loserId = plan.loserId;
      setCandidates((prev) => prev.filter((c) => c.left.id !== loserId && c.right.id !== loserId));
      setActive(null);
      setStep('review');
      onMergeComplete();
    } catch (error) {
      toast({
        title: 'Merge failed',
        description: (error as Error).message,
        variant: 'destructive',
        feedbackSeverity: 'error',
      });
    } finally {
      setMerging(false);
    }
  };

  const takeAll = (side: Side) => {
    if (!active) return;
    const all: Partial<Record<BibliographicField, Side>> = {};
    for (const conflict of listFieldConflicts(active.left, active.right)) {
      all[conflict.field] = side;
    }
    setFieldChoices(all);
    void handleMerge(all);
  };

  const renderConfigure = () => (
    <div className="space-y-5 font-mono">
      <div className="flex gap-2">
        {(['strict', 'balanced', 'loose'] as DupePresetName[]).map((name) => (
          <Button key={name} variant="outline" size="sm" className="font-mono" onClick={() => applyPreset(name)}>
            {name}
          </Button>
        ))}
      </div>

      {(Object.keys(SIGNAL_LABELS) as DupeSignal[]).map((signal) => (
        <div key={signal} className="flex items-center gap-4">
          <Switch
            checked={config.signals[signal].enabled}
            onCheckedChange={(enabled) => updateSignal(signal, { enabled })}
            aria-label={`toggle ${SIGNAL_LABELS[signal]}`}
          />
          <Label className="w-40 text-sm">{SIGNAL_LABELS[signal]}</Label>
          <Slider
            className="flex-1"
            min={0}
            max={100}
            step={5}
            disabled={!config.signals[signal].enabled}
            value={[Math.round(config.signals[signal].weight * 100)]}
            onValueChange={([v]) => updateSignal(signal, { weight: v / 100 })}
          />
          <span className="w-10 text-right text-xs text-muted-foreground">
            {Math.round(config.signals[signal].weight * 100)}%
          </span>
        </div>
      ))}

      <div className="flex items-center gap-4 border-t pt-4">
        <Label className="w-40 text-sm">score_threshold</Label>
        <Slider
          className="flex-1"
          min={30}
          max={100}
          step={5}
          value={[Math.round(config.threshold * 100)]}
          onValueChange={([v]) => setConfig((prev) => ({ ...prev, threshold: v / 100 }))}
        />
        <span className="w-10 text-right text-xs text-muted-foreground">{Math.round(config.threshold * 100)}%</span>
      </div>

      <p className="text-xs text-muted-foreground">// exact_doi_matches_always_score_100%</p>

      <Button onClick={runScan} variant="glow" className="w-full font-mono">
        <Search className="mr-2 h-4 w-4" />
        scan_library ({originals.length} papers)
      </Button>
    </div>
  );

  const renderReview = () => (
    <div className="space-y-3 font-mono">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="font-mono" onClick={() => setStep('configure')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> adjust_heuristic
        </Button>
        <span className="text-xs text-muted-foreground">
          {visibleCandidates.length} candidate_pair{visibleCandidates.length === 1 ? '' : 's'}
        </span>
      </div>

      {visibleCandidates.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">// no_duplicates_found_above_threshold</p>
      ) : (
        <ScrollArea className="h-[420px] pr-3">
          <div className="space-y-2">
            {visibleCandidates.map((candidate) => (
              <div key={pairKey(candidate)} className="rounded-lg border-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="truncate font-semibold">{candidate.left.title}</p>
                    <p className="truncate font-semibold">{candidate.right.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {candidate.left.year ?? '—'} / {candidate.right.year ?? '—'} ·{' '}
                      {(candidate.left.authors ?? []).slice(0, 2).join(', ') || '—'}
                    </p>
                  </div>
                  <Badge variant={candidate.result.score >= 0.9 ? 'destructive' : 'secondary'} className="font-mono">
                    {Math.round(candidate.result.score * 100)}%
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {candidate.result.breakdown.map((s) => (
                    <span key={s.signal} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {s.signal}:{Math.round(s.score * 100)}%
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="glow" className="font-mono" onClick={() => openResolve(candidate)}>
                    <GitMerge className="mr-1 h-3 w-3" /> resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-mono"
                    onClick={() => setDismissed((prev) => new Set([...prev, pairKey(candidate)]))}
                  >
                    not_a_dupe
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  const renderResolve = () => {
    if (!active) return null;
    const conflicts = listFieldConflicts(active.left, active.right);
    const vaultConflicts = listVaultConflicts(active.left.id, active.right.id, vaultCopies);

    const sideLabel = (side: Side) =>
      side === 'left' ? active.left.title : active.right.title;

    return (
      <div className="space-y-4 font-mono">
        <Button variant="ghost" size="sm" className="font-mono" onClick={() => { setActive(null); setStep('review'); }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> back_to_candidates
        </Button>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">// survivor (keeps its id, inherits everything)</Label>
          <div className="flex gap-2">
            {(['left', 'right'] as Side[]).map((side) => (
              <Button
                key={side}
                size="sm"
                variant={survivor === side ? 'glow' : 'outline'}
                className="min-w-0 flex-1 justify-start font-mono"
                onClick={() => setSurvivor(side)}
              >
                <span className="truncate">{sideLabel(side)}</span>
              </Button>
            ))}
          </div>
        </div>

        <ScrollArea className="h-[300px] pr-3">
          <div className="space-y-3">
            {conflicts.length === 0 ? (
              <p className="text-xs text-muted-foreground">// no_field_conflicts — metadata merges cleanly</p>
            ) : (
              conflicts.map((conflict) => (
                <div key={conflict.field} className="rounded-lg border-2 p-2 text-xs">
                  <p className="mb-1 font-semibold">{conflict.field}</p>
                  {(['left', 'right'] as Side[]).map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => setFieldChoices((prev) => ({ ...prev, [conflict.field]: side }))}
                      className={`block w-full rounded border px-2 py-1 text-left ${
                        (fieldChoices[conflict.field] ?? survivor) === side
                          ? 'border-primary bg-primary/10'
                          : 'border-transparent hover:bg-muted'
                      }`}
                    >
                      {fieldValueLabel(side === 'left' ? conflict.left : conflict.right)}
                    </button>
                  ))}
                </div>
              ))
            )}

            {vaultConflicts.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  // both_papers_live_in_these_vaults — pick whose notes/tags survive per vault
                </p>
                {vaultConflicts.map((conflict) => (
                  <div key={conflict.vault_id} className="rounded-lg border-2 p-2 text-xs">
                    <p className="mb-1 font-semibold">{vaultNames.get(conflict.vault_id) ?? conflict.vault_id}</p>
                    {(['left', 'right'] as Side[]).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => setVaultChoices((prev) => ({ ...prev, [conflict.vault_id]: side }))}
                        className={`block w-full truncate rounded border px-2 py-1 text-left ${
                          (vaultChoices[conflict.vault_id] ?? survivor) === side
                            ? 'border-primary bg-primary/10'
                            : 'border-transparent hover:bg-muted'
                        }`}
                      >
                        keep annotations of: {sideLabel(side)}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button size="sm" variant="outline" className="font-mono" disabled={merging} onClick={() => takeAll('left')}>
            take_all_left
          </Button>
          <Button size="sm" variant="outline" className="font-mono" disabled={merging} onClick={() => takeAll('right')}>
            take_all_right
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto font-mono"
            disabled={merging}
            onClick={() => {
              setDismissed((prev) => (active ? new Set([...prev, pairKey(active)]) : prev));
              setActive(null);
              setStep('review');
            }}
          >
            keep_both
          </Button>
          <Button size="sm" variant="glow" className="font-mono" disabled={merging} onClick={() => handleMerge()}>
            <GitMerge className="mr-1 h-3 w-3" />
            {merging ? 'merging…' : 'merge'}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!merging) onOpenChange(next); }}>
      <DialogContent className="max-w-2xl border-2 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-xl font-bold">find_duplicates</DialogTitle>
          <DialogDescription className="font-mono text-sm">
            {step === 'configure' && '// tune_the_matching_heuristic_then_scan'}
            {step === 'review' && '// review_scored_candidate_pairs'}
            {step === 'resolve' && '// resolve_git_style — pick fields and annotations to keep'}
          </DialogDescription>
        </DialogHeader>
        {step === 'configure' && renderConfigure()}
        {step === 'review' && renderReview()}
        {step === 'resolve' && renderResolve()}
      </DialogContent>
    </Dialog>
  );
}
