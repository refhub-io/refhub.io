import { useState, useEffect, useCallback, useRef } from 'react';
import { Publication } from '@/types/database';
import {
  SSPaper,
  SemanticScholarQueueProgress,
  SemanticScholarRequestError,
  formatSemanticScholarErrorMessage,
  getRecommendations,
  isSemanticScholarRateLimitError,
  lookupPaperByDOI,
  lookupPaperByTitle,
  getReferences,
  getCitations,
  runSemanticScholarQueue,
  searchPapersByTopic,
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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SpinnerLoader } from '@/components/ui/loader';
import { Plus, Check, ExternalLink, BookOpen, AlertCircle, RotateCcw, CheckCircle2, Search } from 'lucide-react';

export type AugmentTab = 'references' | 'citations' | 'related' | 'topic';

export interface DiscoveredPaper {
  paper: SSPaper;
  tab: AugmentTab;
  /** vault_publication IDs of source papers that led to this discovery */
  sourcePublicationIds: string[];
}

interface ResolvedPaper {
  pubId: string;
  label: string;
  ssId: string;
}

interface TabFailure {
  pubId: string;
  label: string;
  stage: 'lookup' | AugmentTab;
  error: SemanticScholarRequestError;
}

interface TabStatus {
  state: 'idle' | 'loading' | 'ready' | 'partial' | 'error';
  progress: SemanticScholarQueueProgress | null;
  failures: TabFailure[];
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

function publicationLabel(publication: Publication): string {
  return publication.title?.trim() || publication.doi?.trim() || publication.id;
}

function createIdleTabStatus(): Record<AugmentTab, TabStatus> {
  return {
    related: { state: 'idle', progress: null, failures: [] },
    references: { state: 'idle', progress: null, failures: [] },
    citations: { state: 'idle', progress: null, failures: [] },
    topic: { state: 'idle', progress: null, failures: [] },
  };
}

function getProgressValue(progress: SemanticScholarQueueProgress | null): number {
  if (!progress || progress.total === 0) return 0;
  return Math.round((progress.completed / progress.total) * 100);
}

function summarizeFailures(failures: TabFailure[]): string {
  if (failures.length === 0) return '';

  const rateLimitedCount = failures.filter((failure) => isSemanticScholarRateLimitError(failure.error)).length;
  const failedLabels = failures.slice(0, 3).map((failure) => failure.label).join(' • ');

  if (rateLimitedCount === failures.length) {
    const noun = failures.every((failure) => failure.stage === 'topic')
      ? 'topic search'
      : `${failures.length} seed${failures.length === 1 ? '' : 's'}`;
    return `Semantic Scholar asked to slow down for ${noun}. ${failedLabels}`;
  }

  return `${failures.length} seed${failures.length === 1 ? '' : 's'} failed. ${failedLabels}`;
}

function QueueStatusCard({
  status,
  title,
  acknowledged,
  onAcknowledge,
  onRetry,
}: {
  status: TabStatus;
  title: string;
  acknowledged: boolean;
  onAcknowledge: () => void;
  onRetry: () => void;
}) {
  const progress = status.progress;
  const hasFailures = status.failures.length > 0;
  const firstFailure = status.failures[0];
  const progressValue = getProgressValue(progress);
  const isReady = status.state === 'ready' && !hasFailures;

  if ((status.state === 'idle' && !hasFailures) || (isReady && acknowledged)) return null;

  return (
    <div className="px-6 pt-3">
      <div className="rounded-xl border border-border/60 bg-background/70 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-mono text-xs text-muted-foreground">{title}</p>
            <p className="font-mono text-sm">
              {status.state === 'loading'
                ? '// queue_running'
                : status.state === 'partial'
                  ? '// partial_results_ready'
                  : status.state === 'error'
                    ? '// request_failed'
                    : '// results_ready'}
            </p>
          </div>
          {isReady ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="font-mono text-xs border-neon-green text-neon-green bg-neon-green/10 hover:bg-neon-green/20 hover:text-neon-green"
                onClick={onAcknowledge}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                ok
              </Button>
              <Button type="button" variant="outline" size="sm" className="font-mono text-xs" onClick={onRetry}>
                <RotateCcw className="w-3 h-3 mr-1.5" />
                rerun
              </Button>
            </div>
          ) : (status.state === 'partial' || status.state === 'error') && (
            <Button type="button" variant="outline" size="sm" className="font-mono text-xs" onClick={onRetry}>
              <RotateCcw className="w-3 h-3 mr-1.5" />
              retry_failed
            </Button>
          )}
        </div>

        {progress && !isReady && (
          <div className="space-y-2">
            <Progress value={progressValue} className="h-2" />
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
              <span>{progress.completed}/{progress.total}_done</span>
              <span>{progress.succeeded}_ok</span>
              {progress.failed > 0 && <span>{progress.failed}_failed</span>}
              {progress.rateLimited > 0 && <span>{progress.rateLimited}_rate_limited</span>}
            </div>
          </div>
        )}

        {status.state === 'loading' && (
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <SpinnerLoader className="w-3.5 h-3.5" />
            <span>processing_semantic_scholar_queue...</span>
          </div>
        )}

        {isReady && progress && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
            <span>{progress.completed}/{progress.total}_done</span>
            <span>{progress.succeeded}_ok</span>
          </div>
        )}

        {hasFailures && firstFailure && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/5 text-muted-foreground py-3">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="font-mono text-xs">
              {isSemanticScholarRateLimitError(firstFailure.error) ? 'semantic_scholar_rate_limited' : 'semantic_scholar_partial_failure'}
            </AlertTitle>
            <AlertDescription className="space-y-2 font-mono text-xs">
              <p>{formatSemanticScholarErrorMessage(firstFailure.error)}</p>
              <p>{summarizeFailures(status.failures)}</p>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
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

      {/* Authors + year + venue */}
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground font-mono">
          {formatAuthors(paper.authors)}
          {paper.year && <span className="text-neon-green"> • {paper.year}</span>}
        </p>
        {paper.venue && (
          <p className="text-xs text-muted-foreground/80 font-mono line-clamp-1">
            {paper.venue}
          </p>
        )}
      </div>

      {/* DOI + abstract snippet */}
      <div className="space-y-1.5">
        {paper.externalIds?.DOI && (
          <a
            href={`https://doi.org/${paper.externalIds.DOI}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex max-w-full items-center gap-1 text-xs font-mono text-cyber-blue hover:text-cyber-blue/80 transition-colors"
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span className="truncate">{paper.externalIds.DOI}</span>
          </a>
        )}

        {paper.abstract && (
          <p className="text-sm text-muted-foreground/70 leading-relaxed line-clamp-2">
            {paper.abstract}
          </p>
        )}
      </div>

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
  const isTopicDiscovery = publications.length === 0;
  const [activeTab, setActiveTab] = useState<AugmentTab>(isTopicDiscovery ? 'topic' : 'related');
  const [references, setReferences] = useState<DiscoveredPaper[]>([]);
  const [citations, setCitations] = useState<DiscoveredPaper[]>([]);
  const [related, setRelated] = useState<DiscoveredPaper[]>([]);
  const [topicResults, setTopicResults] = useState<DiscoveredPaper[]>([]);
  const [topicQuery, setTopicQuery] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [tabStatus, setTabStatus] = useState<Record<AugmentTab, TabStatus>>(() => createIdleTabStatus());
  const [acknowledgedTabs, setAcknowledgedTabs] = useState<Set<AugmentTab>>(new Set());

  const fetchedTabs = useRef<Set<AugmentTab>>(new Set());
  const resolvedPaperIds = useRef<ResolvedPaper[]>([]);

  const updateTabStatus = useCallback((tab: AugmentTab, next: Partial<TabStatus>) => {
    setTabStatus((prev) => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        ...next,
      },
    }));
    if (next.state === 'loading') {
      setAcknowledgedTabs((prev) => {
        if (!prev.has(tab)) return prev;
        const nextAcknowledged = new Set(prev);
        nextAcknowledged.delete(tab);
        return nextAcknowledged;
      });
    }
  }, []);

  const resolveSelectedPaperIds = useCallback(async (): Promise<{ resolved: ResolvedPaper[]; failures: TabFailure[] }> => {
    const results = await runSemanticScholarQueue(
      publications,
      async (publication) => {
        let ssId: string | null = null;

        if (publication.doi) {
          ssId = await lookupPaperByDOI(publication.doi);
        }
        if (!ssId && publication.title) {
          ssId = await lookupPaperByTitle(publication.title);
        }

        return ssId;
      },
      {
        concurrency: 2,
        minDelayMs: 400,
        onProgress: (progress) => updateTabStatus('related', { progress, state: 'loading', failures: [] }),
      },
    );

    const resolved: ResolvedPaper[] = [];
    const failures: TabFailure[] = [];

    for (const [index, result] of results.entries()) {
      const publication = publications[index];
      const label = publicationLabel(publication);

      if (!result.ok) {
        failures.push({
          pubId: publication.id,
          label,
          stage: 'lookup',
          error: result.error!,
        });
        continue;
      }

      if (!result.data) continue;

      resolved.push({
        pubId: publication.id,
        label,
        ssId: result.data,
      });
    }

    resolvedPaperIds.current = resolved;
    return { resolved, failures };
  }, [publications, updateTabStatus]);

  const fetchRelated = useCallback(async (force = false) => {
    if (publications.length === 0) return;
    if (!force && fetchedTabs.current.has('related')) return;

    updateTabStatus('related', { state: 'loading', progress: null, failures: [] });

    const { resolved, failures: lookupFailures } = await resolveSelectedPaperIds();

    if (resolved.length === 0) {
      setRelated([]);
      updateTabStatus('related', {
        state: lookupFailures.length > 0 ? 'error' : 'ready',
        failures: lookupFailures,
      });
      fetchedTabs.current.add('related');
      return;
    }

    const recommendationResults = await runSemanticScholarQueue(
      resolved,
      ({ ssId }) => getRecommendations(ssId),
      {
        concurrency: 2,
        minDelayMs: 500,
        onProgress: (progress) => updateTabStatus('related', { progress, state: 'loading' }),
      },
    );

    const map = new Map<string, DiscoveredPaper>();
    const requestFailures = [...lookupFailures];

    for (const result of recommendationResults) {
      if (!result.ok) {
        requestFailures.push({
          pubId: result.item.pubId,
          label: result.item.label,
          stage: 'related',
          error: result.error!,
        });
        continue;
      }

      for (const paper of result.data ?? []) {
        const existing = map.get(paper.paperId);
        if (existing) {
          if (!existing.sourcePublicationIds.includes(result.item.pubId)) {
            existing.sourcePublicationIds.push(result.item.pubId);
          }
        } else {
          map.set(paper.paperId, {
            paper,
            tab: 'related',
            sourcePublicationIds: [result.item.pubId],
          });
        }
      }
    }

    setRelated([...map.values()]);
    updateTabStatus('related', {
      state: requestFailures.length === 0 ? 'ready' : map.size > 0 ? 'partial' : 'error',
      failures: requestFailures,
    });
    fetchedTabs.current.add('related');
  }, [publications, resolveSelectedPaperIds, updateTabStatus]);

  const fetchTopicData = useCallback(async (force = false) => {
    const query = topicQuery.trim();
    if (query.length < 2) {
      setTopicResults([]);
      updateTabStatus('topic', { state: 'idle', progress: null, failures: [] });
      return;
    }

    const fetchKey = `topic:${query.toLowerCase()}`;
    if (!force && fetchedTabs.current.has(fetchKey)) return;

    updateTabStatus('topic', { state: 'loading', progress: null, failures: [] });
    const results = await runSemanticScholarQueue(
      [query],
      (searchQuery) => searchPapersByTopic(searchQuery, 25),
      {
        concurrency: 1,
        minDelayMs: 500,
        onProgress: (progress) => updateTabStatus('topic', { progress, state: 'loading' }),
      },
    );

    const result = results[0];
    if (!result.ok) {
      setTopicResults([]);
      updateTabStatus('topic', {
        state: 'error',
        failures: [{ pubId: 'topic-search', label: query, stage: 'topic', error: result.error! }],
      });
      return;
    }

    const papers = (result.data ?? []).map((paper) => ({
      paper,
      tab: 'topic' as const,
      sourcePublicationIds: [],
    }));
    setTopicResults(papers);
    updateTabStatus('topic', { state: 'ready', failures: [] });
    fetchedTabs.current.add(fetchKey);
  }, [topicQuery, updateTabStatus]);

  const fetchTabData = useCallback(async (tab: 'references' | 'citations', force = false) => {
    if (!force && fetchedTabs.current.has(tab)) return;
    if (resolvedPaperIds.current.length === 0) {
      updateTabStatus(tab, { state: 'error', failures: tabStatus.related.failures });
      return;
    }

    updateTabStatus(tab, { state: 'loading', progress: null, failures: [] });

    const results = await runSemanticScholarQueue(
      resolvedPaperIds.current,
      ({ ssId }) => (tab === 'references' ? getReferences(ssId) : getCitations(ssId)),
      {
        concurrency: 2,
        minDelayMs: 500,
        onProgress: (progress) => updateTabStatus(tab, { progress, state: 'loading' }),
      },
    );

    const map = new Map<string, DiscoveredPaper>();
    const failures: TabFailure[] = [];

    for (const result of results) {
      if (!result.ok) {
        failures.push({
          pubId: result.item.pubId,
          label: result.item.label,
          stage: tab,
          error: result.error!,
        });
        continue;
      }

      for (const paper of result.data ?? []) {
        const existing = map.get(paper.paperId);
        if (existing) {
          if (!existing.sourcePublicationIds.includes(result.item.pubId)) {
            existing.sourcePublicationIds.push(result.item.pubId);
          }
        } else {
          map.set(paper.paperId, {
            paper,
            tab,
            sourcePublicationIds: [result.item.pubId],
          });
        }
      }
    }

    if (tab === 'references') setReferences([...map.values()]);
    else setCitations([...map.values()]);

    updateTabStatus(tab, {
      state: failures.length === 0 ? 'ready' : map.size > 0 ? 'partial' : 'error',
      failures,
    });
    fetchedTabs.current.add(tab);
  }, [tabStatus.related.failures, updateTabStatus]);

  // Open dialog: kick off seed-based recommendations when seeds exist; otherwise show topic discovery.
  useEffect(() => {
    if (open && !isTopicDiscovery && !fetchedTabs.current.has('related')) {
      void fetchRelated();
    }
    if (open && isTopicDiscovery) {
      setActiveTab('topic');
    }
    if (!open) {
      fetchedTabs.current = new Set();
      resolvedPaperIds.current = [];
      setActiveTab(isTopicDiscovery ? 'topic' : 'related');
      setReferences([]);
      setCitations([]);
      setRelated([]);
      setTopicResults([]);
      setTopicQuery('');
      setAddedIds(new Set());
      setLoadingIds(new Set());
      setTabStatus(createIdleTabStatus());
      setAcknowledgedTabs(new Set());
    }
  }, [open, fetchRelated, isTopicDiscovery]);

  // Switch tab → lazy-load refs/citations if not yet fetched
  const handleTabChange = (tab: AugmentTab) => {
    setActiveTab(tab);
    if (tab === 'references' || tab === 'citations') {
      void fetchTabData(tab);
    }
  };

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
    activeTab === 'topic' ? topicResults : activeTab === 'related' ? related : activeTab === 'references' ? references : citations;
  const activeStatus = tabStatus[activeTab];
  const initialLoading = !isTopicDiscovery && tabStatus.related.state === 'loading' && related.length === 0;
  const acknowledgeTab = (tab: AugmentTab) => {
    setAcknowledgedTabs((prev) => new Set(prev).add(tab));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-mobile max-w-[100vw] sm:rounded-2xl sm:w-[95vw] sm:max-w-4xl sm:h-auto sm:min-h-[400px] sm:max-h-[90vh] flex flex-col bg-card/95 backdrop-blur-xl border-2 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-5 pb-3 border-b border-border/50">
          <DialogTitle className="text-xl sm:text-2xl font-bold font-mono">
            // vault_augmentation
          </DialogTitle>
          <DialogDescription className="font-mono text-sm text-muted-foreground">
            {isTopicDiscovery
              ? '// semantic_scholar • topic_discovery'
              : `// semantic_scholar • ${publications.length} paper${publications.length !== 1 ? 's' : ''} selected`}
          </DialogDescription>
        </DialogHeader>

        {initialLoading && (
          <div className="flex-1 flex flex-col justify-center gap-4 px-6 py-6">
            <QueueStatusCard
              status={tabStatus.related}
              title="// resolving_lookup_and_related_queue"
              acknowledged={acknowledgedTabs.has('related')}
              onAcknowledge={() => acknowledgeTab('related')}
              onRetry={() => void fetchRelated(true)}
            />
          </div>
        )}

        {!initialLoading && (
          <>
            {isTopicDiscovery ? (
              <form
                className="shrink-0 px-6 pt-4 flex flex-col sm:flex-row gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void fetchTopicData(true);
                }}
              >
                <Input
                  value={topicQuery}
                  onChange={(event) => setTopicQuery(event.target.value)}
                  placeholder="topic, keyword, or paper title"
                  className="font-mono"
                  disabled={tabStatus.topic.state === 'loading'}
                />
                <Button type="submit" variant="glow" className="font-mono" disabled={topicQuery.trim().length < 2 || tabStatus.topic.state === 'loading'}>
                  {tabStatus.topic.state === 'loading' ? <SpinnerLoader className="w-4 h-4 mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  search
                </Button>
              </form>
            ) : (
              <Tabs
                value={activeTab}
                onValueChange={(v) => handleTabChange(v as AugmentTab)}
                className="shrink-0 px-6 pt-3"
              >
                <TabsList className="justify-start w-auto h-8">
                  <TabsTrigger value="related" className="text-xs font-mono h-6 px-3">
                    related ({related.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="references"
                    className="text-xs font-mono h-6 px-3"
                    disabled={tabStatus.related.state === 'loading'}
                  >
                    cites→ ({references.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="citations"
                    className="text-xs font-mono h-6 px-3"
                    disabled={tabStatus.related.state === 'loading'}
                  >
                    ←cited_by ({citations.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <QueueStatusCard
              status={activeStatus}
              title={`// ${activeTab}_queue_status`}
              acknowledged={acknowledgedTabs.has(activeTab)}
              onAcknowledge={() => acknowledgeTab(activeTab)}
              onRetry={() => {
                if (activeTab === 'topic') {
                  void fetchTopicData(true);
                  return;
                }
                if (activeTab === 'related') {
                  void fetchRelated(true);
                  return;
                }

                void fetchTabData(activeTab, true);
              }}
            />

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin px-6 pb-4 pt-2">
              {activeStatus.state === 'loading' && activePapers.length === 0 ? (
                <div className="flex items-center justify-center gap-3 text-muted-foreground py-8">
                  <SpinnerLoader className="w-4 h-4" />
                  <span className="font-mono text-xs">// fetching...</span>
                </div>
              ) : (
                <PaperList
                  papers={activePapers}
                  vaultPublications={vaultPublications}
                  addedIds={addedIds}
                  loadingIds={loadingIds}
                  onAdd={handleAdd}
                />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
