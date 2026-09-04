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
  onScan: () => void;
  onApprove: (suggestion: RelationshipSuggestion) => void;
  onDismiss: (suggestion: RelationshipSuggestion) => void;
}

function getProgressValue(progress: SemanticScholarQueueProgress | null): number {
  if (!progress || progress.total === 0) return 0;
  return Math.round((progress.completed / progress.total) * 100);
}

export function VaultRelationshipsPanel({ suggestions, scanning, progress, approvingKey, onScan, onApprove, onDismiss }: VaultRelationshipsPanelProps) {
  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground font-mono">// scan_for_relationships</p>
        <Button type="button" variant="outline" size="sm" disabled={scanning} onClick={onScan}>
          {scanning ? 'scanning...' : 'scan for relationships'}
        </Button>
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
