import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { topicToSlug } from '@/lib/codexDiscovery';

interface TopicSummaryPanelProps {
  relatedTopics: string[];
  newInLast30Days: number;
  /** Keeps the related-topics row on one line instead of wrapping — used
   * for the desktop single-row header, which scrolls horizontally instead
   * of growing to a second row. */
  nowrap?: boolean;
}

// Matching vaults and curators used to live here too, but that duplicated
// context every match already carries — they now show inline per match in
// MatchProvenanceList's "why_these_matched" list instead, right next to the
// paper they're actually about.
export default function TopicSummaryPanel({ relatedTopics, newInLast30Days, nowrap = false }: TopicSummaryPanelProps) {
  const groupClass = cn('flex items-center gap-1.5', nowrap ? 'flex-nowrap shrink-0' : 'flex-wrap');

  return (
    <>
      {newInLast30Days > 0 && (
        <span className="text-xs font-mono text-primary px-2 py-0.5 rounded-full bg-primary/10 shrink-0">
          {newInLast30Days}_new_in_last_30_days
        </span>
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
    </>
  );
}
