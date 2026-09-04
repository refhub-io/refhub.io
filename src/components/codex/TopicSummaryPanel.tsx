import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { topicToSlug } from '@/lib/codexDiscovery';
import type { Vault } from '@/types/database';

interface Curator {
  display_name: string | null;
  username: string | null;
}

interface MatchingVault {
  vault: Vault;
  count: number;
}

interface TopicSummaryPanelProps {
  relatedTopics: string[];
  curators: Curator[];
  newInLast30Days: number;
  matchingVaults?: MatchingVault[];
  /** Keeps each group (matching vaults / related topics / curators) on one
   * line instead of wrapping — used for the desktop single-row header,
   * which scrolls horizontally instead of growing to a second row. */
  nowrap?: boolean;
}

export default function TopicSummaryPanel({ relatedTopics, curators, newInLast30Days, matchingVaults = [], nowrap = false }: TopicSummaryPanelProps) {
  const groupClass = cn('flex items-center gap-1.5', nowrap ? 'flex-nowrap shrink-0' : 'flex-wrap');

  return (
    <>
      {newInLast30Days > 0 && (
        <span className="text-xs font-mono text-primary px-2 py-0.5 rounded-full bg-primary/10 shrink-0">
          {newInLast30Days}_new_in_last_30_days
        </span>
      )}

      {matchingVaults.length > 0 && (
        <div className={groupClass}>
          <span className="text-xs text-muted-foreground/60 font-mono shrink-0">// matching_vaults</span>
          {matchingVaults.map(({ vault, count }) => {
            const content = (
              <>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: vault.color }} />
                <span>{vault.name}</span>
                <span className="text-muted-foreground">{count}_match{count !== 1 ? 'es' : ''}</span>
              </>
            );
            return vault.public_slug ? (
              <Link
                key={vault.id}
                to={`/public/${vault.public_slug}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card/50 hover:border-primary/30 transition-colors text-xs font-mono shrink-0"
              >
                {content}
              </Link>
            ) : (
              <span
                key={vault.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card/30 text-xs font-mono opacity-70 shrink-0"
              >
                {content}
              </span>
            );
          })}
        </div>
      )}

      <div className={groupClass}>
        <span className="text-xs text-muted-foreground/60 font-mono shrink-0">// related_topics</span>
        {relatedTopics.length > 0 ? (
          relatedTopics.map((topic) => (
            <Link key={topic} to={`/codex/topic/${topicToSlug(topic)}`} className="shrink-0">
              <Badge variant="secondary" className="font-mono text-xs">{topic}</Badge>
            </Link>
          ))
        ) : (
          <span className="text-sm text-muted-foreground font-mono shrink-0">// no_related_topics_yet</span>
        )}
      </div>

      <div className={groupClass}>
        <span className="text-xs text-muted-foreground/60 font-mono shrink-0">// curators</span>
        {curators.length > 0 ? (
          curators.map((curator, index) => (
            <Badge key={`${curator.username}-${index}`} variant="outline" className="font-mono text-xs shrink-0">
              {curator.display_name || curator.username}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground font-mono shrink-0">// no_curators_yet</span>
        )}
      </div>
    </>
  );
}
