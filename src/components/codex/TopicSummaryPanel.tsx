import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
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
}

export default function TopicSummaryPanel({ relatedTopics, curators, newInLast30Days, matchingVaults = [] }: TopicSummaryPanelProps) {
  return (
    <div className="space-y-3">
      {newInLast30Days > 0 && (
        <p className="text-xs font-mono text-primary">{newInLast30Days}_new_in_last_30_days</p>
      )}

      {matchingVaults.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground/60 font-mono mb-1.5">// matching_vaults</p>
          <div className="flex flex-wrap gap-2">
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card/50 hover:border-primary/30 transition-colors text-xs font-mono"
                >
                  {content}
                </Link>
              ) : (
                <span
                  key={vault.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card/30 text-xs font-mono opacity-70"
                >
                  {content}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <div>
          <p className="text-xs text-muted-foreground/60 font-mono mb-1.5">// related_topics</p>
          {relatedTopics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {relatedTopics.map((topic) => (
                <Link key={topic} to={`/codex/topic/${topicToSlug(topic)}`}>
                  <Badge variant="secondary" className="font-mono text-xs">{topic}</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground font-mono">// no_related_topics_yet</p>
          )}
        </div>

        <div>
          <p className="text-xs text-muted-foreground/60 font-mono mb-1.5">// curators</p>
          {curators.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {curators.map((curator, index) => (
                <Badge key={`${curator.username}-${index}`} variant="outline" className="font-mono text-xs">
                  {curator.display_name || curator.username}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground font-mono">// no_curators_yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
