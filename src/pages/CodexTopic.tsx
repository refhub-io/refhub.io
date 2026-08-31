import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  fetchPublicCodexPublications,
  matchPublicationsForTopic,
  slugToTopic,
  deriveRelatedTopics,
  countNewInLastDays,
  sortTopicMatches,
  type TopicMatch,
  type TopicSortMode,
  type VaultPopularity,
} from '@/lib/codexDiscovery';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAllPublications } from '@/hooks/useAllPublications';
import { SidebarDndBoundary } from '@/components/layout/SidebarDndBoundary';
import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { PublicationList } from '@/components/publications/PublicationList';
import { PublicationViewDialog } from '@/components/publications/PublicationViewDialog';
import { ProfileDialog } from '@/components/profile/ProfileDialog';
import { LoadingSpinner } from '@/components/ui/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TopicSummaryPanel from '@/components/codex/TopicSummaryPanel';
import MatchProvenanceList from '@/components/codex/MatchProvenanceList';
import { ArrowLeft, Scroll } from 'lucide-react';
import type { Publication, Vault, Tag } from '@/types/database';

export default function CodexTopic() {
  const { topicSlug } = useParams();
  const navigate = useNavigate();
  const topic = topicSlug ? slugToTopic(topicSlug) : '';

  const { user } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const { vaults: myVaults } = useAllPublications();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [matches, setMatches] = useState<TopicMatch[]>([]);
  const [curators, setCurators] = useState<{ display_name: string | null; username: string | null }[]>([]);
  const [sortMode, setSortMode] = useState<TopicSortMode>('relevance');
  const [vaultPopularity, setVaultPopularity] = useState<Record<string, VaultPopularity>>({});
  const [viewingPublication, setViewingPublication] = useState<Publication | null>(null);

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(false);
      // Reset per-topic derived state up front: navigating topic-to-topic
      // (the primary flow, via related-topic chips / vault links) must not
      // leave the PREVIOUS topic's curators/popularity rendered under the
      // new topic's heading while the new topic's fetch is still in flight
      // or if the new topic simply has none of its own.
      setCurators([]);
      setVaultPopularity({});
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
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('user_id, display_name, username')
            .in('user_id', ownerIds);
          if (profilesError) throw profilesError;
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

  const sortedDirectMatches = useMemo(
    () => sortTopicMatches(directMatches, sortMode, vaultPopularity, relationCounts),
    [directMatches, sortMode, vaultPopularity, relationCounts],
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

  const vaultMatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    directMatches.forEach((m) => { counts[m.vault.id] = (counts[m.vault.id] || 0) + 1; });
    return counts;
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

  const matchingVaultsForPanel = useMemo(
    () => matchedVaults.map((vault) => ({ vault, count: vaultMatchCounts[vault.id] || 0 })),
    [matchedVaults, vaultMatchCounts],
  );

  // Tag badges on this page come from each match's `signals`, not FilterBuilder's tag picker.
  const tagsForList: Tag[] = [];

  // Sidebar nav needs the signed-in user's OWN vaults, distinct from
  // matchedVaults (the vaults that happen to match this topic).
  const ownedVaults = useMemo(() => myVaults.filter((v) => v.user_id === user?.id), [myVaults, user?.id]);
  const sharedVaults = useMemo(() => myVaults.filter((v) => v.user_id !== user?.id), [myVaults, user?.id]);

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
    <div className="min-h-screen bg-background flex">
      {user && (
        <SidebarDndBoundary
          vaults={ownedVaults}
          sharedVaults={sharedVaults}
          selectedVaultId={null}
          onSelectVault={(vaultId) => (vaultId ? navigate(`/vault/${vaultId}`) : navigate('/dashboard'))}
          onCreateVault={() => navigate('/dashboard?createVault=1')}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
          profile={profile}
          onEditProfile={() => setIsProfileDialogOpen(true)}
        />
      )}
      <div className={`flex-1 min-w-0 flex flex-col min-h-screen ${user ? 'lg:pl-72' : ''}`}>
        {user && !isMobileSidebarOpen && (
          <MobileMenuButton onClick={() => setIsMobileSidebarOpen(true)} className="fixed top-4 left-4 z-50" />
        )}

        <div className="border-b border-border bg-card/50 backdrop-blur-xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/codex"
                aria-label="Back to codex"
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="w-6 h-6 rounded-md flex items-center justify-center bg-gradient-to-br from-amber-500/20 to-orange-500/20 shrink-0">
                <Scroll className="w-3.5 h-3.5 text-amber-500" />
              </div>
            </div>

            <TopicSummaryPanel
              relatedTopics={relatedTopics}
              curators={curators}
              newInLast30Days={newInLast30Days}
              matchingVaults={matchingVaultsForPanel}
            />

            {directMatches.length > 0 && (
              <Select value={sortMode} onValueChange={(value) => setSortMode(value as TopicSortMode)}>
                <SelectTrigger className="h-7 w-auto rounded-full text-xs font-mono shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance" className="text-xs font-mono">sort: relevance</SelectItem>
                  <SelectItem value="recent" className="text-xs font-mono">sort: recent</SelectItem>
                  <SelectItem value="popular" className="text-xs font-mono">sort: most forked/favorited</SelectItem>
                  <SelectItem value="connected" className="text-xs font-mono">sort: most connected</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {sortedDirectMatches.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground font-mono text-sm">// no_public_papers_match_this_topic_yet</p>
          </div>
        ) : (
          <>
            <MatchProvenanceList matches={sortedDirectMatches} onOpenPublication={(pub) => setViewingPublication(pub)} />
            <PublicationList
              publications={sortedDirectMatches.map((m) => m.publication)}
              tags={tagsForList}
              vaults={matchedVaults}
              publicationVaultsMap={publicationVaultsMap}
              publicationTagsMap={{}}
              relationsCountMap={{}}
              selectedVault={null}
              listTitle={topic}
              onOpenPublication={(pub) => setViewingPublication(pub)}
              onExportBibtex={() => {}}
              onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
            />
          </>
        )}

        {citationOnlyMatches.length > 0 && (
          <div className="border-t border-border">
            <div className="px-4 pt-6 pb-2">
              <h2 className="text-sm font-mono text-muted-foreground">// related_via_citation</h2>
              <p className="text-xs text-muted-foreground/70">
                cited by a direct match — not tagged or keyworded with "{topic}" itself
              </p>
            </div>
            <MatchProvenanceList matches={citationOnlyMatches} onOpenPublication={(pub) => setViewingPublication(pub)} />
            <PublicationList
              publications={citationOnlyMatches.map((m) => m.publication)}
              tags={tagsForList}
              vaults={citationOnlyVaults}
              publicationVaultsMap={citationOnlyVaultsMap}
              publicationTagsMap={{}}
              relationsCountMap={{}}
              selectedVault={null}
              listTitle={`related to ${topic}`}
              onOpenPublication={(pub) => setViewingPublication(pub)}
              onExportBibtex={() => {}}
              onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
            />
          </div>
        )}
      </div>

      <PublicationViewDialog
        open={!!viewingPublication}
        onOpenChange={(open) => {
          if (!open) setViewingPublication(null);
        }}
        publication={viewingPublication}
        tags={[]}
        allTags={[]}
      />

      <ProfileDialog
        open={isProfileDialogOpen}
        onOpenChange={(open) => {
          setIsProfileDialogOpen(open);
          if (!open) {
            void refetchProfile();
          }
        }}
      />
    </div>
  );
}
