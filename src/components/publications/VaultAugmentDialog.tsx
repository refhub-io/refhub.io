import { useState, useEffect, useCallback } from 'react';
import { Publication } from '@/types/database';
import {
  SSPaper,
  lookupPaperByDOI,
  lookupPaperByTitle,
  getReferences,
  getCitations,
  getRecommendations,
} from '@/lib/semanticScholar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SpinnerLoader } from '@/components/ui/loader';
import { Plus, Check, ExternalLink, BookOpen } from 'lucide-react';

export type AugmentTab = 'references' | 'citations' | 'related';

export interface DiscoveredPaper {
  paper: SSPaper;
  tab: AugmentTab;
  /** vault_publication IDs of source papers that led to this discovery */
  sourcePublicationIds: string[];
}

interface VaultAugmentDialogProps {
  publications: Publication[];
  vaultPublications: Publication[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPaper: (paper: SSPaper, tab: AugmentTab, sourcePublicationIds: string[]) => Promise<void>;
}

function isAlreadyInVault(paper: SSPaper, vaultPublications: Publication[]): boolean {
  if (paper.externalIds?.DOI) {
    const doi = paper.externalIds.DOI.toLowerCase();
    if (vaultPublications.some((p) => p.doi?.toLowerCase() === doi)) return true;
  }
  const titleLower = paper.title.toLowerCase().trim();
  return vaultPublications.some((p) => p.title.toLowerCase().trim() === titleLower);
}

function formatAuthors(authors: { name: string }[]): string {
  if (authors.length === 0) return 'Unknown';
  if (authors.length === 1) return authors[0].name;
  if (authors.length === 2) return `${authors[0].name}, ${authors[1].name}`;
  return `${authors[0].name} et al.`;
}

function paperUrl(paper: SSPaper): string {
  if (paper.externalIds?.DOI) return `https://doi.org/${paper.externalIds.DOI}`;
  if (paper.url) return paper.url;
  return `https://www.semanticscholar.org/paper/${paper.paperId}`;
}

function PaperRow({
  paper,
  inVault,
  added,
  loading,
  onAdd,
}: {
  paper: SSPaper;
  inVault: boolean;
  added: boolean;
  loading: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border-2 bg-card group hover:border-primary/30 transition-all duration-200">
      {/* Title + action buttons */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors min-w-0">
          {paper.title}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {inVault || added ? (
            <Badge variant="outline" className="font-mono text-xs h-7 px-2 text-muted-foreground">
              <Check className="w-3 h-3 mr-1" />
              {inVault ? 'in_vault' : 'added'}
            </Badge>
          ) : (
            <Button
              type="button"
              variant="glow"
              size="sm"
              className="h-7 text-xs px-3"
              disabled={loading}
              onClick={onAdd}
            >
              {loading ? <SpinnerLoader className="w-3 h-3" /> : <Plus className="w-3 h-3 mr-1" />}
              add
            </Button>
          )}
        </div>
      </div>

      {/* Authors + year */}
      <p className="text-sm text-muted-foreground font-mono">
        {formatAuthors(paper.authors)}
        {paper.year && <span className="text-neon-green"> • {paper.year}</span>}
      </p>

      {/* Abstract snippet */}
      {paper.abstract && (
        <p className="text-sm text-muted-foreground/70 leading-relaxed line-clamp-2">
          {paper.abstract}
        </p>
      )}

      {/* Footer: citations + source link */}
      <div className="flex items-center gap-3 pt-1">
        {paper.citationCount != null && (
          <span className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground">
            <BookOpen className="w-3.5 h-3.5" />
            {paper.citationCount}_cited
          </span>
        )}
        <a
          href={paperUrl(paper)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {paper.externalIds?.DOI ? 'doi' : 'semantic_scholar'}
        </a>
      </div>
    </div>
  );
}

function PaperList({
  papers,
  vaultPublications,
  addedIds,
  loadingIds,
  onAdd,
}: {
  papers: DiscoveredPaper[];
  vaultPublications: Publication[];
  addedIds: Set<string>;
  loadingIds: Set<string>;
  onAdd: (discovered: DiscoveredPaper) => void;
}) {
  if (papers.length === 0) {
    return <p className="font-mono text-xs text-muted-foreground py-4 text-center">// no_results_found</p>;
  }

  return (
    <div className="space-y-2">
      {papers.map((discovered) => (
        <PaperRow
          key={discovered.paper.paperId}
          paper={discovered.paper}
          inVault={isAlreadyInVault(discovered.paper, vaultPublications)}
          added={addedIds.has(discovered.paper.paperId)}
          loading={loadingIds.has(discovered.paper.paperId)}
          onAdd={() => onAdd(discovered)}
        />
      ))}
    </div>
  );
}

export function VaultAugmentDialog({
  publications,
  vaultPublications,
  open,
  onOpenChange,
  onAddPaper,
}: VaultAugmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [activeTab, setActiveTab] = useState<AugmentTab>('related');
  const [references, setReferences] = useState<DiscoveredPaper[]>([]);
  const [citations, setCitations] = useState<DiscoveredPaper[]>([]);
  const [related, setRelated] = useState<DiscoveredPaper[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (publications.length === 0) return;
    setLoading(true);
    setFetched(false);

    const refMap = new Map<string, DiscoveredPaper>();
    const citeMap = new Map<string, DiscoveredPaper>();
    const relMap = new Map<string, DiscoveredPaper>();

    await Promise.all(
      publications.map(async (pub) => {
        let paperId: string | null = null;
        if (pub.doi) paperId = await lookupPaperByDOI(pub.doi);
        if (!paperId && pub.title) paperId = await lookupPaperByTitle(pub.title);
        if (!paperId) return;

        const [refs, cites, recs] = await Promise.all([
          getReferences(paperId),
          getCitations(paperId),
          getRecommendations(paperId),
        ]);

        for (const p of refs) {
          const existing = refMap.get(p.paperId);
          if (existing) existing.sourcePublicationIds.push(pub.id);
          else refMap.set(p.paperId, { paper: p, tab: 'references', sourcePublicationIds: [pub.id] });
        }
        for (const p of cites) {
          const existing = citeMap.get(p.paperId);
          if (existing) existing.sourcePublicationIds.push(pub.id);
          else citeMap.set(p.paperId, { paper: p, tab: 'citations', sourcePublicationIds: [pub.id] });
        }
        for (const p of recs) {
          if (!relMap.has(p.paperId))
            relMap.set(p.paperId, { paper: p, tab: 'related', sourcePublicationIds: [pub.id] });
        }
      })
    );

    setReferences([...refMap.values()]);
    setCitations([...citeMap.values()]);
    setRelated([...relMap.values()]);
    setFetched(true);
    setLoading(false);
  }, [publications]);

  useEffect(() => {
    if (open && !fetched) {
      fetchData();
    }
    if (!open) {
      setFetched(false);
      setActiveTab('related');
      setReferences([]);
      setCitations([]);
      setRelated([]);
      setAddedIds(new Set());
      setLoadingIds(new Set());
    }
  }, [open, fetched, fetchData]);

  const handleAdd = async (discovered: DiscoveredPaper) => {
    const { paper, tab, sourcePublicationIds } = discovered;
    setLoadingIds((prev) => new Set(prev).add(paper.paperId));
    try {
      await onAddPaper(paper, tab, sourcePublicationIds);
      setAddedIds((prev) => new Set(prev).add(paper.paperId));
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(paper.paperId);
        return next;
      });
    }
  };

  const activePapers =
    activeTab === 'related' ? related : activeTab === 'references' ? references : citations;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg h-[78vh] flex flex-col bg-card/95 backdrop-blur-xl border-2 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-5 pb-3 border-b border-border/50">
          <DialogTitle className="text-xl font-bold font-mono">
            // vault_augmentation
          </DialogTitle>
          <DialogDescription className="font-mono text-sm text-muted-foreground">
            // semantic_scholar • {publications.length} paper{publications.length !== 1 ? 's' : ''} selected
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground px-6">
            <SpinnerLoader className="w-5 h-5" />
            <span className="font-mono text-sm">// fetching_from_semantic_scholar...</span>
          </div>
        )}

        {!loading && fetched && (
          <>
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as AugmentTab)}
              className="shrink-0 px-6 pt-3"
            >
              <TabsList className="justify-start w-auto h-8">
                <TabsTrigger value="related" className="text-xs font-mono h-6 px-3">
                  related ({related.length})
                </TabsTrigger>
                <TabsTrigger value="references" className="text-xs font-mono h-6 px-3">
                  cites→ ({references.length})
                </TabsTrigger>
                <TabsTrigger value="citations" className="text-xs font-mono h-6 px-3">
                  ←cited_by ({citations.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 pb-4 pt-2">
              <PaperList
                papers={activePapers}
                vaultPublications={vaultPublications}
                addedIds={addedIds}
                loadingIds={loadingIds}
                onAdd={handleAdd}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
