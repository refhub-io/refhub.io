import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Play, X } from 'lucide-react';
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
import { Progress } from '@/components/ui/progress';
import { SpinnerLoader } from '@/components/ui/loader';
import { Publication, PublicationTag } from '@/types/database';
import {
  HealthIssue,
  HealthIssueType,
  VaultHealthEnrichmentResult,
  computeVaultHealthScore,
  computeVaultHealthUserStats,
  groupHealthIssuesByType,
  runVaultHealthEnrichment,
  scanVaultHealth,
} from '@/lib/vaultHealthCheck';
import { SemanticScholarQueueProgress } from '@/lib/semanticScholar';
import { createPublicationSyncPatch, formatSyncValue, PublicationSyncDiff } from '@/lib/publicationSync';
import { VaultHealthGauge } from './VaultHealthGauge';

// Fixed display order for issue-type sections, grouped by importance tier
// (independent of the order issues happen to land in during the scan) so the
// report visually communicates "these are required, these are secondary,
// these are nice-to-have" rather than presenting every issue as equally bad.
const TIER_GROUPS: { label: string; types: HealthIssueType[] }[] = [
  {
    label: 'required',
    types: [
      'missing_title', 'missing_authors', 'missing_year',
      'missing_doi', 'missing_venue', 'missing_publication_type',
    ],
  },
  {
    label: 'secondary',
    types: [
      'missing_volume', 'missing_issue', 'missing_pages', 'missing_editor',
      'missing_publisher', 'missing_edition', 'missing_series', 'missing_isbn',
    ],
  },
  {
    label: 'supplementary',
    types: [
      'missing_pdf', 'missing_url', 'missing_keywords', 'missing_abstract',
      'missing_bibtex_key', 'malformed_bibtex_key',
    ],
  },
  {
    label: 'duplicates',
    types: ['possible_duplicate'],
  },
];

type HealthCheckPhase = 'report' | 'enriching' | 'review' | 'applying' | 'done';

interface VaultHealthCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publications: Publication[];
  onApplyDiffs: (patches: { publicationId: string; patch: Partial<Publication> }[]) => Promise<void>;
  disabled?: boolean;
  /** Used only to compute the tier-4 "missing tags" info stat — omit and that stat is hidden. */
  publicationTags?: PublicationTag[];
  /** publicationId -> google-drive-attached PDF url, if any. Used only for the "missing drive pdf" info stat. */
  driveUrlsMap?: Record<string, string | null>;
}

function publicationLabel(publication: Publication | undefined): string {
  if (!publication) return 'unknown_publication';
  return publication.title?.trim() || publication.doi?.trim() || publication.id;
}

function getProgressValue(progress: SemanticScholarQueueProgress | null): number {
  if (!progress || progress.total === 0) return 0;
  return Math.round((progress.completed / progress.total) * 100);
}

function IssueSection({
  type,
  issues,
  pubById,
}: {
  type: HealthIssueType;
  issues: HealthIssue[];
  pubById: Map<string, Publication>;
}) {
  return (
    <div className="rounded-lg border-2 p-3 space-y-2">
      <p className="font-mono text-sm font-bold text-foreground">
        {`// ${type} (${issues.length})`}
      </p>
      <ul className="space-y-1">
        {issues.map((issue, index) => (
          <li key={`${issue.publicationId}-${index}`} className="font-mono text-xs text-muted-foreground truncate">
            {publicationLabel(pubById.get(issue.publicationId))}
            {issue.type === 'possible_duplicate' && issue.duplicateOfPublicationId && (
              <span> ↔ {publicationLabel(pubById.get(issue.duplicateOfPublicationId))}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiffRow({
  compositeKey,
  diff,
  checked,
  onToggle,
}: {
  compositeKey: string;
  diff: PublicationSyncDiff;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className={`rounded-lg border p-3 cursor-pointer transition-all ${
        checked ? 'bg-muted/30 border-border' : 'bg-muted/5 border-border/30 opacity-40'
      }`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={compositeKey}
          checked={checked}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-mono font-bold text-foreground mb-2 tracking-wide">
            {diff.label}
          </div>
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
}

export function VaultHealthCheckDialog({
  open,
  onOpenChange,
  publications,
  onApplyDiffs,
  disabled,
  publicationTags,
  driveUrlsMap,
}: VaultHealthCheckDialogProps) {
  const [phase, setPhase] = useState<HealthCheckPhase>('report');
  const [progress, setProgress] = useState<SemanticScholarQueueProgress | null>(null);
  const [results, setResults] = useState<VaultHealthEnrichmentResult[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());

  // Reset to a clean report each time the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setPhase('report');
      setProgress(null);
      setResults([]);
      setCheckedKeys(new Set());
    }
  }, [open]);

  const issues = useMemo(() => (open ? scanVaultHealth(publications) : []), [open, publications]);
  const groupedIssues = useMemo(() => groupHealthIssuesByType(issues), [issues]);
  const healthScore = useMemo(() => computeVaultHealthScore(publications, issues), [publications, issues]);
  const pubById = useMemo(() => new Map(publications.map((p) => [p.id, p])), [publications]);
  const hasDoiPublications = useMemo(() => publications.some((p) => !!p.doi), [publications]);

  const taggedPublicationIds = useMemo(() => {
    if (!publicationTags) return undefined;
    const set = new Set<string>();
    for (const pt of publicationTags) {
      if (pt.publication_id) set.add(pt.publication_id);
      if (pt.vault_publication_id) set.add(pt.vault_publication_id);
    }
    return set;
  }, [publicationTags]);

  const userStats = useMemo(
    () =>
      computeVaultHealthUserStats(publications, {
        hasTag: taggedPublicationIds ? (id) => taggedPublicationIds.has(id) : undefined,
        hasDriveUrl: driveUrlsMap ? (id) => !!driveUrlsMap[id] : undefined,
      }),
    [publications, taggedPublicationIds, driveUrlsMap],
  );

  const resultsWithDiffs = useMemo(() => results.filter((r) => r.diffs.length > 0), [results]);
  const totalDiffCount = useMemo(
    () => resultsWithDiffs.reduce((sum, r) => sum + r.diffs.length, 0),
    [resultsWithDiffs],
  );
  // A failed lookup yields `diffs: []`, which the filter above drops — without
  // surfacing these the user would be told the vault is already up to date even
  // when Semantic Scholar was rate-limited or unreachable for every paper.
  const failedResults = useMemo(() => results.filter((r) => !!r.error), [results]);

  const runEnrichment = async () => {
    setPhase('enriching');
    setProgress(null);
    const enrichmentResults = await runVaultHealthEnrichment(publications, (p) => setProgress(p));
    setResults(enrichmentResults);
    // Default every incoming diff to selected, mirroring PublicationSyncDialog's convention.
    const allKeys = new Set<string>();
    for (const result of enrichmentResults) {
      for (const diff of result.diffs) {
        allKeys.add(`${result.publication.id}:${diff.field}`);
      }
    }
    setCheckedKeys(allKeys);
    setPhase('review');
  };

  const toggleDiff = (compositeKey: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(compositeKey)) next.delete(compositeKey);
      else next.add(compositeKey);
      return next;
    });
  };

  const checkedCount = checkedKeys.size;
  const canApply = !disabled && checkedCount > 0 && phase === 'review';

  const handleApply = async () => {
    if (!canApply) return;
    setPhase('applying');
    const patches: { publicationId: string; patch: Partial<Publication> }[] = [];
    for (const result of resultsWithDiffs) {
      const selectedDiffs = result.diffs.filter((d) =>
        checkedKeys.has(`${result.publication.id}:${d.field}`),
      );
      if (selectedDiffs.length === 0) continue;
      patches.push({ publicationId: result.publication.id, patch: createPublicationSyncPatch(selectedDiffs) });
    }
    try {
      await onApplyDiffs(patches);
      setPhase('done');
    } catch {
      // Let the caller surface the error (e.g. via toast); just return the
      // user to the review phase so they aren't stuck on a dead-end spinner
      // and can retry without re-running enrichment.
      setPhase('review');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-mobile max-w-[100vw] sm:rounded-2xl sm:w-[95vw] sm:max-w-3xl sm:h-auto sm:min-h-[400px] sm:max-h-[85vh] flex flex-col bg-card/95 backdrop-blur-xl border-2 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-5 pb-3 border-b border-border/50">
          <DialogTitle className="text-xl sm:text-2xl font-bold font-mono">
            // vault_health_check
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-muted-foreground">
            {phase === 'report' && `// ${issues.length} issue${issues.length === 1 ? '' : 's'} found`}
            {phase === 'enriching' && '// querying_semantic_scholar...'}
            {(phase === 'review' || phase === 'applying') && `// ${totalDiffCount} field${totalDiffCount === 1 ? '' : 's'} changed`}
            {phase === 'done' && '// health_check_complete'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 py-4 space-y-3">
          {phase === 'report' && (
            <>
              {publications.length > 0 && (
                <VaultHealthGauge
                  scorePercent={healthScore.scorePercent}
                  completeCount={healthScore.completeCount}
                  totalCount={healthScore.totalCount}
                />
              )}
              {issues.length === 0 ? (
                <p className="font-mono text-xs text-muted-foreground py-8 text-center">// vault_looks_healthy</p>
              ) : (
                TIER_GROUPS.map((group) => {
                  const typesWithIssues = group.types.filter((type) => (groupedIssues[type]?.length ?? 0) > 0);
                  if (typesWithIssues.length === 0) return null;
                  return (
                    <div key={group.label} className="space-y-2">
                      <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        {`// ${group.label}`}
                      </p>
                      {typesWithIssues.map((type) => (
                        <IssueSection key={type} type={type} issues={groupedIssues[type]} pubById={pubById} />
                      ))}
                    </div>
                  );
                })
              )}
              {publications.length > 0 && (
                <div className="rounded-lg border-2 border-dashed border-border/50 p-3 space-y-1">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    // user_metadata (not scored)
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
                    {userStats.missingTagsCount != null && (
                      <span>{userStats.missingTagsCount}_missing_tags</span>
                    )}
                    <span>{userStats.missingNotesCount}_missing_notes</span>
                    {userStats.missingDriveUrlCount != null && (
                      <span>{userStats.missingDriveUrlCount}_missing_drive_pdf</span>
                    )}
                    <span>{userStats.unreadCount}_unread</span>
                  </div>
                </div>
              )}
            </>
          )}

          {phase === 'enriching' && (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <SpinnerLoader className="w-3.5 h-3.5" />
                <span>processing_semantic_scholar_queue...</span>
              </div>
              <Progress value={getProgressValue(progress)} className="h-2" />
              {progress && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
                  <span>{progress.completed}/{progress.total}_done</span>
                  <span>{progress.succeeded}_ok</span>
                  {progress.failed > 0 && <span>{progress.failed}_failed</span>}
                  {progress.rateLimited > 0 && <span>{progress.rateLimited}_rate_limited</span>}
                </div>
              )}
            </div>
          )}

          {(phase === 'review' || phase === 'applying') && failedResults.length > 0 && (
            <div className="rounded-lg border-2 border-neon-orange/40 p-3 space-y-1">
              <p className="font-mono text-sm font-bold text-neon-orange">
                {`// ${failedResults.length}_lookups_failed`}
              </p>
              <p className="font-mono text-xs text-muted-foreground break-words">
                {failedResults[0].error}
              </p>
            </div>
          )}

          {(phase === 'review' || phase === 'applying') && (
            resultsWithDiffs.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground py-8 text-center">// no_metadata_changes_found</p>
            ) : (
              resultsWithDiffs.map((result) => (
                <div key={result.publication.id} className="space-y-2">
                  <h3 className="font-mono text-sm font-bold text-foreground truncate">
                    {publicationLabel(result.publication)}
                  </h3>
                  <div className="space-y-2">
                    {result.diffs.map((diff) => {
                      const compositeKey = `${result.publication.id}:${diff.field}`;
                      return (
                        <DiffRow
                          key={compositeKey}
                          compositeKey={compositeKey}
                          diff={diff}
                          checked={checkedKeys.has(compositeKey)}
                          onToggle={() => toggleDiff(compositeKey)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))
            )
          )}

          {phase === 'done' && (
            <p className="font-mono text-xs text-muted-foreground py-8 text-center">// changes_applied</p>
          )}
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-border/50 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-mono">
            <X className="w-4 h-4 mr-1.5" />
            close
          </Button>

          {phase === 'report' && (
            <Button
              variant="glow"
              onClick={() => void runEnrichment()}
              disabled={!hasDoiPublications}
              className="font-mono"
            >
              <Play className="w-4 h-4 mr-1.5" />
              run_enrichment
            </Button>
          )}

          {(phase === 'review' || phase === 'applying') && (
            <Button
              variant="glow"
              onClick={() => void handleApply()}
              disabled={!canApply}
              className="font-mono"
            >
              {phase === 'applying' ? <SpinnerLoader className="w-4 h-4 mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
              apply_selected ({checkedCount})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
