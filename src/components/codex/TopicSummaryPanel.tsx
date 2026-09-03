import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { topicToSlug } from '@/lib/codexDiscovery';

interface Curator {
  display_name: string | null;
  username: string | null;
}

interface TopicSummaryPanelProps {
  relatedTopics: string[];
  curators: Curator[];
  newInLast30Days: number;
}

export default function TopicSummaryPanel({ relatedTopics, curators, newInLast30Days }: TopicSummaryPanelProps) {
  return (
    <div className="px-4 py-4 space-y-4 border-b border-border">
      {newInLast30Days > 0 && (
        <p className="text-xs font-mono text-primary">{newInLast30Days}_new_in_last_30_days</p>
      )}

      <div>
        <p className="text-xs text-muted-foreground/60 font-mono mb-1">// related_topics</p>
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
        <p className="text-xs text-muted-foreground/60 font-mono mb-1">// curators</p>
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
  );
}
