import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TopicMatch, TopicMatchSignal } from '@/lib/codexDiscovery';
import type { Publication } from '@/types/database';

interface MatchProvenanceListProps {
  matches: TopicMatch[];
  onOpenPublication: (publication: Publication) => void;
}

function signalLabel(signal: TopicMatchSignal): string {
  switch (signal.type) {
    case 'tag':
      return `tag: ${signal.value}`;
    case 'keyword':
      return `keyword: ${signal.value}`;
    case 'notes':
      // Intentionally short — this is provenance ("why did this match"), not
      // content. The raw notes snippet can be arbitrarily long and belongs
      // in the publication's own detail view, not a badge.
      return 'mentioned in notes';
    case 'citation':
      // By construction this signal type never appears in a direct-match
      // list, but if used to annotate a citation-only section, label it
      // generically — resolving viaPublicationId to a title is out of scope.
      return 'cited by a related match';
    default:
      return '';
  }
}

/**
 * Compact, inspectable "why did this match" list: one row per match, with a
 * badge for every signal that produced it. This makes the matching library's
 * signal provenance (spec: "fully inspectable — no black-box scoring")
 * actually visible to a visitor, instead of only existing internally.
 */
export default function MatchProvenanceList({ matches, onOpenPublication }: MatchProvenanceListProps) {
  const [open, setOpen] = useState(false);
  if (matches.length === 0) return null;

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-card/50 transition-colors"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
        )}
        <span className="text-xs text-muted-foreground/60 font-mono">// why_these_matched</span>
        <Badge variant="outline" className="font-mono text-[10px]">{matches.length}</Badge>
      </button>
      {open && (
        <ul className="space-y-2 px-4 pb-3">
          {matches.map((match) => (
            <li key={match.publication.id} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenPublication(match.publication)}
                className="text-sm font-semibold text-left text-foreground hover:text-primary hover:underline"
              >
                {match.publication.title}
              </button>
              <div className="flex flex-wrap gap-1">
                {match.signals.map((signal, index) => (
                  <Badge key={`${signal.type}-${index}`} variant="outline" className="font-mono text-[10px]">
                    {signalLabel(signal)}
                  </Badge>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
