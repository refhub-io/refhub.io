import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  fetchPublicCodexPublications,
  matchPublicationsForTopic,
  slugToTopic,
  type TopicMatch,
} from '@/lib/codexDiscovery';
import { PublicationList } from '@/components/publications/PublicationList';
import { LoadingSpinner } from '@/components/ui/loading';
import { ArrowLeft } from 'lucide-react';
import type { Vault, Tag } from '@/types/database';

export default function CodexTopic() {
  const { topicSlug } = useParams();
  const topic = topicSlug ? slugToTopic(topicSlug) : '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [matches, setMatches] = useState<TopicMatch[]>([]);

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { corpus, relations } = await fetchPublicCodexPublications(supabase);
        if (cancelled) return;
        setMatches(matchPublicationsForTopic(topic, corpus, relations));
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
      </div>

      {directMatches.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-muted-foreground font-mono text-sm">// no_public_papers_match_this_topic_yet</p>
        </div>
      ) : (
        <PublicationList
          publications={directMatches.map((m) => m.publication)}
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
