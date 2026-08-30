import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  fetchPublicCodexPublications,
  matchPublicationsForTopic,
  slugToTopic,
  deriveRelatedTopics,
  countNewInLastDays,
  applyTopicFacets,
  sortTopicMatches,
  type TopicMatch,
  type TopicFacets,
  type TopicSortMode,
  type VaultPopularity,
} from '@/lib/codexDiscovery';
import { PublicationList } from '@/components/publications/PublicationList';
import { LoadingSpinner } from '@/components/ui/loading';
import TopicSummaryPanel from '@/components/codex/TopicSummaryPanel';
import { ArrowLeft } from 'lucide-react';
import type { Vault, Tag } from '@/types/database';

export default function CodexTopic() {
  const { topicSlug } = useParams();
  const topic = topicSlug ? slugToTopic(topicSlug) : '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [matches, setMatches] = useState<TopicMatch[]>([]);
  const [curators, setCurators] = useState<{ display_name: string | null; username: string | null }[]>([]);
  const [facets, setFacets] = useState<TopicFacets>({});
  const [sortMode, setSortMode] = useState<TopicSortMode>('relevance');
  const [vaultPopularity, setVaultPopularity] = useState<Record<string, VaultPopularity>>({});

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { corpus, relations } = await fetchPublicCodexPublications(supabase);
        if (cancelled) return;
        const computedMatches = matchPublicationsForTopic(topic, corpus, relations);
        if (cancelled) return;
        setMatches(computedMatches);

        const ownerIds = [...new Set(
          computedMatches
            .filter((m) => m.signals.some((s) => s.type !== 'citation'))
            .map((m) => m.vault.user_id),
        )];
        if (ownerIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, display_name, username')
            .in('user_id', ownerIds);
          if (!cancelled) setCurators((profiles || []).map((p) => ({ display_name: p.display_name, username: p.username })));
        }

        const matchedVaultIds = [...new Set(computedMatches.map((m) => m.vault.id))];
        if (matchedVaultIds.length > 0) {
          const popularity: Record<string, VaultPopularity> = {};
          await Promise.all(matchedVaultIds.map(async (vaultId) => {
            const [{ count: favorites }, { count: forks }] = await Promise.all([
              supabase.from('vault_favorites').select('*', { count: 'exact', head: true }).eq('vault_id', vaultId),
              supabase.from('vault_forks').select('*', { count: 'exact', head: true }).eq('original_vault_id', vaultId),
            ]);
            popularity[vaultId] = { favorites: favorites || 0, forks: forks || 0 };
          }));
          if (!cancelled) setVaultPopularity(popularity);
        }
      } catch (err) {
        logger.error('CodexTopic', 'Error fetching discovery data:', err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [topic]);

  const directMatches = useMemo(
    () => matches.filter((m) => m.signals.some((s) => s.type !== 'citation')),
    [matches],
  );

  const relationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    matches.forEach((m) => {
      m.signals.forEach((s) => {
        if (s.type === 'citation') counts[s.viaPublicationId] = (counts[s.viaPublicationId] || 0) + 1;
      });
    });
    return counts;
  }, [matches]);

  const facetedDirectMatches = useMemo(
    () => sortTopicMatches(applyTopicFacets(directMatches, facets), sortMode, vaultPopularity, relationCounts),
    [directMatches, facets, sortMode, vaultPopularity, relationCounts],
  );

  const matchedVaults = useMemo(() => {
    const byId = new Map<string, Vault>();
    directMatches.forEach((m) => byId.set(m.vault.id, m.vault));
    return Array.from(byId.values());
  }, [directMatches]);

  const publicationVaultsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    directMatches.forEach((m) => { map[m.publication.id] = [m.vault.id]; });
    return map;
  }, [directMatches]);

  const citationOnlyMatches = useMemo(
    () => matches.filter((m) => m.signals.length > 0 && m.signals.every((s) => s.type === 'citation')),
    [matches],
  );

  const citationOnlyVaults = useMemo(() => {
    const byId = new Map<string, Vault>();
    citationOnlyMatches.forEach((m) => byId.set(m.vault.id, m.vault));
    return Array.from(byId.values());
  }, [citationOnlyMatches]);

  const citationOnlyVaultsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    citationOnlyMatches.forEach((m) => { map[m.publication.id] = [m.vault.id]; });
    return map;
  }, [citationOnlyMatches]);

  const relatedTopics = useMemo(() => deriveRelatedTopics(topic, directMatches), [topic, directMatches]);
  const newInLast30Days = useMemo(() => countNewInLastDays(directMatches, 30), [directMatches]);

  // Tag badges on this page come from each match's `signals`, not FilterBuilder's tag picker.
  const tagsForList: Tag[] = [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-muted-foreground font-mono text-sm">// could_not_load_this_topic</p>
        <Link to="/codex" className="text-sm underline">back to the codex</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 backdrop-blur-xl px-4 py-4">
        <Link to="/codex" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-mono mb-2">
          <ArrowLeft className="w-4 h-4" /> back_to_codex
        </Link>
        <h1 className="text-2xl font-bold font-mono">{topic}</h1>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {matchedVaults.length}_vault{matchedVaults.length !== 1 ? 's' : ''} // {directMatches.length}_paper{directMatches.length !== 1 ? 's' : ''}
        </p>
        <TopicSummaryPanel relatedTopics={relatedTopics} curators={curators} newInLast30Days={newInLast30Days} />
      </div>

      {directMatches.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-muted-foreground font-mono text-sm">// no_public_papers_match_this_topic_yet</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
            <select
              className="text-xs font-mono border border-input rounded-md h-8 px-2 bg-background"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as TopicSortMode)}
            >
              <option value="relevance">sort: relevance</option>
              <option value="recent">sort: recent</option>
              <option value="popular">sort: most forked/favorited</option>
              <option value="connected">sort: most connected</option>
            </select>
            <input
              className="text-xs font-mono border border-input rounded-md h-8 px-2 bg-background"
              placeholder="filter: author"
              value={facets.author || ''}
              onChange={(e) => setFacets((f) => ({ ...f, author: e.target.value || undefined }))}
            />
            <input
              className="text-xs font-mono border border-input rounded-md h-8 px-2 bg-background"
              placeholder="filter: venue"
              value={facets.venue || ''}
              onChange={(e) => setFacets((f) => ({ ...f, venue: e.target.value || undefined }))}
            />
            <input
              className="text-xs font-mono border border-input rounded-md h-8 px-2 bg-background w-24"
              placeholder="filter: year"
              type="number"
              value={facets.year ?? ''}
              onChange={(e) => setFacets((f) => ({ ...f, year: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>
          <PublicationList
            publications={facetedDirectMatches.map((m) => m.publication)}
            tags={tagsForList}
            vaults={matchedVaults}
            publicationVaultsMap={publicationVaultsMap}
            publicationTagsMap={{}}
            relationsCountMap={{}}
            selectedVault={null}
            listTitle={topic}
            onExportBibtex={() => {}}
            onMobileMenuOpen={() => {}}
          />
        </>
      )}

      {citationOnlyMatches.length > 0 && (
        <div className="border-t border-border">
          <div className="px-4 pt-6 pb-2">
            <h2 className="text-sm font-mono text-muted-foreground">// related_via_citation</h2>
            <p className="text-xs text-muted-foreground/70 font-mono">
              cited by a direct match — not tagged or keyworded with "{topic}" itself
            </p>
          </div>
          <PublicationList
            publications={citationOnlyMatches.map((m) => m.publication)}
            tags={tagsForList}
            vaults={citationOnlyVaults}
            publicationVaultsMap={citationOnlyVaultsMap}
            publicationTagsMap={{}}
            relationsCountMap={{}}
            selectedVault={null}
            listTitle={`related to ${topic}`}
            onExportBibtex={() => {}}
            onMobileMenuOpen={() => {}}
          />
        </div>
      )}
    </div>
  );
}
