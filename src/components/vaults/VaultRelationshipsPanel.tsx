import { RelationshipSuggestionsList } from '@/components/publications/RelationshipSuggestionsList';
import type { RelationshipSuggestion } from '@/lib/relationshipSuggestions';
import type { SemanticScholarQueueProgress } from '@/lib/semanticScholar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface VaultRelationshipsPanelProps {
  suggestions: RelationshipSuggestion[];
  scanning: boolean;
  progress: SemanticScholarQueueProgress | null;
  approvingKey: string | null;
  /** Whether the most recent scan actually skipped anything via the 24h
   * cache — force_rescan is only offered then, since otherwise there's
   * nothing for it to bypass. */
  canForceRescan: boolean;
  /** failed + rate-limited count from the most recently completed scan.
   * These papers' DOIs were never cached, so a plain rescan already retries
   * exactly them first — this only gates a dedicated "rescan_failed" button
   * so the user isn't left guessing whether re-scanning is worth it. */
  lastScanFailedCount: number;
  onScan: (force?: boolean) => void;
  onApprove: (suggestion: RelationshipSuggestion) => void;
  onDismiss: (suggestion: RelationshipSuggestion) => void;
}

function getProgressValue(progress: SemanticScholarQueueProgress | null): number {
  if (!progress || progress.total === 0) return 0;
  return Math.round((progress.completed / progress.total) * 100);
}

export function VaultRelationshipsPanel({ suggestions, scanning, progress, approvingKey, canForceRescan, lastScanFailedCount, onScan, onApprove, onDismiss }: VaultRelationshipsPanelProps) {
  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground font-mono">// scan_for_relationships</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {lastScanFailedCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={scanning}
              onClick={() => onScan(false)}
              title="Retry only the papers that failed or were rate-limited on the last scan"
            >
              {`rescan_failed (${lastScanFailedCount})`}
            </Button>
          )}
          {canForceRescan && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={scanning}
              onClick={() => onScan(true)}
              title="Ignore the 24h skip-cache and re-check every paper with a DOI"
            >
              force_rescan
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={scanning} onClick={() => onScan(false)}>
            {scanning ? 'scanning...' : 'scan for relationships'}
          </Button>
        </div>
      </div>

      {scanning && (
        <div className="space-y-1">
          <Progress value={getProgressValue(progress)} className="h-2" />
          {progress && (
            <div className="flex gap-3 text-xs text-muted-foreground font-mono">
              <span>{progress.completed}/{progress.total}_done</span>
              <span>{progress.succeeded}_ok</span>
              {progress.failed > 0 && <span>{progress.failed}_failed</span>}
              {progress.rateLimited > 0 && <span>{progress.rateLimited}_rate_limited</span>}
            </div>
          )}
        </div>
      )}

      {suggestions.length === 0 && !scanning && (
        <p className="text-xs text-muted-foreground font-mono py-2">// no suggestions yet — run a scan to check this vault's papers against each other</p>
      )}

      <RelationshipSuggestionsList
        suggestions={suggestions}
        approvingKey={approvingKey}
        onApprove={onApprove}
        onDismiss={onDismiss}
      />
    </div>
  );
}
