import { useState } from 'react';
import { Publication } from '@/types/database';
import { SSPaper, lookupPaperByDOI, lookupPaperByTitle, getReferences, getCitations, getRecommendations } from '@/lib/semanticScholar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SpinnerLoader } from '@/components/ui/loader';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';

interface SemanticScholarPanelProps {
  publication: Publication;
  onAddPaper?: (paper: SSPaper) => void;
}

function PaperList({
  papers,
  onAddPaper,
}: {
  papers: SSPaper[];
  onAddPaper?: (paper: SSPaper) => void;
}) {
  if (papers.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-2">No results found.</p>;
  }

  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto">
      {papers.map((paper) => (
        <div
          key={paper.paperId}
          className="flex items-start gap-2 p-2 rounded-lg border bg-muted/30 group"
        >
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-sm leading-snug line-clamp-2" title={paper.title}>
              {paper.title}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              {paper.authors[0]?.name ?? 'Unknown'}
              {paper.year ? ` • ${paper.year}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            {paper.citationCount != null && (
              <Badge variant="outline" className="text-xs h-5 px-1.5">
                {paper.citationCount} cites
              </Badge>
            )}
            {onAddPaper && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Add to Vault"
                onClick={() => onAddPaper(paper)}
              >
                <Plus className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SemanticScholarPanel({ publication, onAddPaper }: SemanticScholarPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [references, setReferences] = useState<SSPaper[]>([]);
  const [citations, setCitations] = useState<SSPaper[]>([]);
  const [recommendations, setRecommendations] = useState<SSPaper[]>([]);
  const [fetched, setFetched] = useState(false);

  const handleExpand = async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);

    if (willExpand && !fetched) {
      setLoading(true);
      setError(null);
      setNotFound(false);

      try {
        let paperId: string | null = null;

        if (publication.doi) {
          paperId = await lookupPaperByDOI(publication.doi);
        }

        if (!paperId && publication.title) {
          paperId = await lookupPaperByTitle(publication.title);
        }

        if (!paperId) {
          setNotFound(true);
          setFetched(true);
          return;
        }

        const [refs, cites, recs] = await Promise.all([
          getReferences(paperId),
          getCitations(paperId),
          getRecommendations(paperId),
        ]);

        setReferences(refs);
        setCitations(cites);
        setRecommendations(recs);
        setFetched(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data from Semantic Scholar');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleExpand}
        className="flex items-center gap-2 w-full text-left text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0" />
        )}
        Discover via Semantic Scholar
      </button>

      {expanded && (
        <div className="pl-1">
          {loading && (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <SpinnerLoader className="w-5 h-5" />
              <span>Looking up paper…</span>
            </div>
          )}

          {!loading && error && (
            <p className="text-sm text-destructive py-2">{error}</p>
          )}

          {!loading && notFound && (
            <p className="text-sm text-muted-foreground italic py-2">
              Paper not found on Semantic Scholar.
            </p>
          )}

          {!loading && !error && !notFound && fetched && (
            <Tabs defaultValue="references">
              <TabsList className="h-8">
                <TabsTrigger value="references" className="text-xs h-6 px-3">
                  References ({references.length})
                </TabsTrigger>
                <TabsTrigger value="citations" className="text-xs h-6 px-3">
                  Citations ({citations.length})
                </TabsTrigger>
                <TabsTrigger value="related" className="text-xs h-6 px-3">
                  related ({recommendations.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="references">
                <PaperList papers={references} onAddPaper={onAddPaper} />
              </TabsContent>
              <TabsContent value="citations">
                <PaperList papers={citations} onAddPaper={onAddPaper} />
              </TabsContent>
              <TabsContent value="related">
                <PaperList papers={recommendations} onAddPaper={onAddPaper} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      )}
    </div>
  );
}
