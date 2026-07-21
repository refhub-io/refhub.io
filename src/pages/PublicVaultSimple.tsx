import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag, PublicationRelation } from '@/types/database';
import { formatTimeAgo } from '@/lib/utils';
import { resolveLastUpdatedActivity } from '@/lib/vaultPublicationAttribution';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useVaultFavorites } from '@/hooks/useVaultFavorites';
import { useVaultFork } from '@/hooks/useVaultFork';
import { useVaultAccess, requestVaultAccess } from '@/hooks/useVaultAccess';
import { getForkSourceHref, getForkSourceLabel, getVaultForkInfo, VaultForkInfo } from '@/lib/vaultFork';
import { Sidebar } from '@/components/layout/Sidebar';
import { PublicationList } from '@/components/publications/PublicationList';
import { PublicationViewDialog } from '@/components/publications/PublicationViewDialog';
import { CollectionAnalytics } from '@/components/publications/CollectionAnalytics';
import { ExportDialog } from '@/components/publications/ExportDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/branding/BrandMark';
import {
  ArrowLeft,
  Globe,
  Heart,
  GitFork,
  Clock,
  PencilLine,
} from 'lucide-react';
import VaultAccessBadge from '../components/vaults/VaultAccessBadge';

export default function PublicVault() {
  const { slug } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isFavorite, toggleFavorite } = useVaultFavorites();
  const { forkVault } = useVaultFork();
  const navigate = useNavigate();
  const [vault, setVault] = useState<Vault | null>(null);
  const [vaultOwner, setVaultOwner] = useState<{ display_name: string | null; username: string | null } | null>(null);
  const [lastUpdatedActivity, setLastUpdatedActivity] = useState<{
    profile: { display_name: string | null; username: string | null } | null;
    timestamp: string;
  } | null>(null);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [forkCount, setForkCount] = useState(0);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [publicationTags, setPublicationTags] = useState<PublicationTag[]>([]);
  const [publicationRelations, setPublicationRelations] = useState<PublicationRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [forking, setForking] = useState(false);
  const [forkInfo, setForkInfo] = useState<VaultForkInfo | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [userVaults, setUserVaults] = useState<Vault[]>([]);
  const [sharedVaults, setSharedVaults] = useState<Vault[]>([]);
  const [viewingPublication, setViewingPublication] = useState<Publication | null>(null);
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [exportPublications, setExportPublications] = useState<Publication[]>([]);
  const { canEdit, isOwner, userRole } = useVaultAccess(vault?.id || '');
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [pendingRequestRole, setPendingRequestRole] = useState<'viewer' | 'editor' | null>(null);

  const publicationTagsMap = useMemo(() => {
    const vaultPubTagsMap: Record<string, string[]> = {};
    publicationTags.forEach((pt) => {
      const vaultPubId = pt.vault_publication_id || pt.publication_id;
      if (!vaultPubTagsMap[vaultPubId]) vaultPubTagsMap[vaultPubId] = [];
      vaultPubTagsMap[vaultPubId].push(pt.tag_id);
    });

    const pubTagsMap: Record<string, string[]> = {};
    publications.forEach((pub) => {
      pubTagsMap[pub.id] = vaultPubTagsMap[pub.id] || [];
    });

    return pubTagsMap;
  }, [publicationTags, publications]);

  const originalToVaultPublicationMap = useMemo(() => {
    const map = new Map<string, string>();
    publications.forEach((pub) => {
      if (pub.original_publication_id) {
        map.set(pub.original_publication_id, pub.id);
      }
    });
    return map;
  }, [publications]);

  const normalizedPublicationRelations = useMemo(() => {
    const publicationIds = new Set(publications.map((pub) => pub.id));

    return publicationRelations
      .map((rel) => ({
        ...rel,
        publication_id: originalToVaultPublicationMap.get(rel.publication_id) || rel.publication_id,
        related_publication_id: originalToVaultPublicationMap.get(rel.related_publication_id) || rel.related_publication_id,
      }))
      .filter((rel) => publicationIds.has(rel.publication_id) && publicationIds.has(rel.related_publication_id));
  }, [originalToVaultPublicationMap, publicationRelations, publications]);

  const relationsCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    normalizedPublicationRelations.forEach((rel) => {
      map[rel.publication_id] = (map[rel.publication_id] || 0) + 1;
      map[rel.related_publication_id] = (map[rel.related_publication_id] || 0) + 1;
    });

    return map;
  }, [normalizedPublicationRelations]);

  // Fetch user's own vaults and shared vaults
  const fetchUserVaults = useCallback(async () => {
    if (!user) {
      setUserVaults([]);
      setSharedVaults([]);
      return;
    }

    try {
      // Fetch owned vaults
      const { data: ownedVaults, error: ownedError } = await supabase
        .from('vaults')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

      if (ownedError) throw ownedError;

      // Fetch shared vaults
      const { data: sharedVaultIds, error: sharedError } = await supabase
        .from('vault_shares')
        .select('vault_id')
        .or(`shared_with_email.eq.${user.email},shared_with_user_id.eq.${user.id}`);

      if (sharedError) throw sharedError;

      if (sharedVaultIds && sharedVaultIds.length > 0) {
        const vaultIds = sharedVaultIds.map(vs => vs.vault_id);
        const { data: sharedVaultsData, error: vaultsError } = await supabase
          .from('vaults')
          .select('*')
          .in('id', vaultIds)
          .order('name');

        if (vaultsError) throw vaultsError;
        setSharedVaults(sharedVaultsData || []);
      } else {
        setSharedVaults([]);
      }

      setUserVaults(ownedVaults || []);
    } catch (error) {
      logger.error('PublicVaultSimple', 'Error fetching user vaults:', error);
    }
  }, [user]);

  // Fetch public vault
  const fetchPublicVault = useCallback(async () => {
    if (!slug) return;
    
    setLoading(true);
    setNotFound(false);
    try {
      // First, try to find a public vault with this slug
      const { data: vaultData, error } = await supabase
        .from('vaults')
        .select('*')
        .eq('public_slug', slug)
        .eq('visibility', 'public')
        .maybeSingle();

      if (error) {
        logger.error('PublicVaultSimple', 'Error fetching vault:', error);
        setNotFound(true);
        return;
      }

      // If no public vault found, check if there's a protected/private vault with this slug
      // and redirect to the proper vault page
      if (!vaultData) {
        const { data: anyVault } = await supabase
          .from('vaults')
          .select('id, visibility')
          .eq('public_slug', slug)
          .maybeSingle();

        if (anyVault) {
          // Vault exists but is no longer public - redirect to the vault detail page
          // which will handle proper access control (show request access page for protected)
          navigate(`/vault/${anyVault.id}`, { replace: true });
          return;
        }
        
        setNotFound(true);
        return;
      }

      setVault(vaultData);

      // Fetch fork attribution (if this vault is itself a fork)
      getVaultForkInfo(vaultData.id).then(setForkInfo).catch(() => {});

      // Fetch vault owner profile
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('user_id', vaultData.user_id)
        .maybeSingle();
      
      setVaultOwner(ownerProfile);

      // Fetch favorites count
      const { count: favsCount } = await supabase
        .from('vault_favorites')
        .select('*', { count: 'exact', head: true })
        .eq('vault_id', vaultData.id);
      
      setFavoritesCount(favsCount || 0);

      // Fetch fork count
      const { count: forksCount } = await supabase
        .from('vault_forks')
        .select('*', { count: 'exact', head: true })
        .eq('original_vault_id', vaultData.id);
      
      setForkCount(forksCount || 0);

      // Fetch last updated activity
      const { data: lastUpdatedPub } = await supabase
        .from('vault_publications')
        .select('updated_by, created_by, updated_at, created_at')
        .eq('vault_id', vaultData.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastUpdated = resolveLastUpdatedActivity(lastUpdatedPub, vaultData.updated_at);

      if (lastUpdated.actorId) {
        const { data: updaterProfile } = await supabase
          .from('profiles')
          .select('display_name, username')
          .eq('user_id', lastUpdated.actorId)
          .maybeSingle();
        setLastUpdatedActivity({
          profile: updaterProfile,
          timestamp: lastUpdated.timestamp,
        });
      } else {
        setLastUpdatedActivity({
          profile: null,
          timestamp: lastUpdated.timestamp,
        });
      }

      // Increment view count
      await supabase.rpc('increment_vault_views', { vault_uuid: vaultData.id });

      // Fetch publications via vault_publications
      const { data: vaultPublicationsDataRaw } = await supabase
        .from('vault_publications')
        .select('*')
        .eq('vault_id', vaultData.id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vaultPublicationsData = vaultPublicationsDataRaw as any[];

      let pubsData: Publication[] = [];
      if (vaultPublicationsData && vaultPublicationsData.length > 0) {
        // Convert vault publications to Publication format
        pubsData = vaultPublicationsData.map(vp => ({
          id: vp.id,
          user_id: vp.created_by || vaultData.user_id,
          title: vp.title,
          authors: vp.authors || [],
          year: vp.year,
          journal: vp.journal,
          volume: vp.volume,
          issue: vp.issue,
          pages: vp.pages,
          doi: vp.doi,
          url: vp.url,
          abstract: vp.abstract,
          pdf_url: vp.pdf_url,
          bibtex_key: vp.bibtex_key,
          publication_type: vp.publication_type || 'article',
          notes: vp.notes,
          booktitle: vp.booktitle,
          chapter: vp.chapter,
          edition: vp.edition,
          editor: vp.editor,
          howpublished: vp.howpublished,
          institution: vp.institution,
          number: vp.number,
          organization: vp.organization,
          publisher: vp.publisher,
          school: vp.school,
          series: vp.series,
          type: vp.type,
          eid: vp.eid,
          isbn: vp.isbn,
          issn: vp.issn,
          keywords: vp.keywords,
          reading_state: vp.reading_state || 'unread',
          important: vp.important ?? false,
          created_at: vp.created_at,
          updated_at: vp.updated_at,
          original_publication_id: vp.original_publication_id,
        }));
        setPublications(pubsData);

        // Fetch tags using vault_publication_id
        const vaultPubIds = pubsData.map(p => p.id);
        const originalPublicationIds = pubsData
          .map((p) => p.original_publication_id)
          .filter((id): id is string => Boolean(id));
        if (vaultPubIds.length > 0) {
          const { data: allRelationsData } = await supabase
            .from('publication_relations')
            .select('*');

          const allPublicationIdsSet = new Set([...vaultPubIds, ...originalPublicationIds]);
          setPublicationRelations(
            (allRelationsData || []).filter((rel) =>
              allPublicationIdsSet.has(rel.publication_id) ||
              allPublicationIdsSet.has(rel.related_publication_id)
            ) as PublicationRelation[]
          );

          const { data: pubTagsData } = await supabase
            .from('publication_tags')
            .select('*')
            .in('vault_publication_id', vaultPubIds);

          if (pubTagsData) {
            setPublicationTags(pubTagsData);
            
            const tagIds = [...new Set(pubTagsData.map(pt => pt.tag_id))];
            if (tagIds.length > 0) {
              const { data: tagsData } = await supabase
                .from('tags')
                .select('*')
                .in('id', tagIds);

              if (tagsData) {
                setTags(tagsData);
              }
            } else {
              setTags([]);
            }
          } else {
            setPublicationTags([]);
            setTags([]);
          }
        }
      } else {
        setPublicationRelations([]);
        setPublicationTags([]);
        setTags([]);
      }
    } catch (error) {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug, navigate]);

  useEffect(() => {
    fetchPublicVault();
  }, [fetchPublicVault]);

  useEffect(() => {
    fetchUserVaults();
  }, [fetchUserVaults]);

  useEffect(() => {
    if (!user || !vault) return;
    const checkPendingRequest = async () => {
      const { data: existingRequest } = await supabase
        .from('vault_access_requests')
        .select('id, status, requested_role')
        .eq('vault_id', vault.id)
        .eq('requester_id', user.id)
        .in('status', ['pending', 'approved'])
        .maybeSingle();

      if (existingRequest?.status === 'pending') {
        setHasPendingRequest(true);
        setPendingRequestRole(existingRequest.requested_role === 'editor' ? 'editor' : 'viewer');
      } else {
        setHasPendingRequest(false);
        setPendingRequestRole(null);
      }
    };
    checkPendingRequest();
  }, [user, vault]);

  const handleFavorite = async () => {
    if (!user) {
      toast({
        title: 'sign_in_required',
        description: 'Please sign in to favorite this vault.',
        variant: 'destructive', feedbackSeverity: 'error',
      });
      return;
    }
    if (!vault) return;
    
    const wasFavorited = isFavorite(vault.id);
    const success = await toggleFavorite(vault.id);
    if (success) {
      // Update count immediately
      setFavoritesCount(prev => wasFavorited ? Math.max(0, prev - 1) : prev + 1);
      toast({
        title: wasFavorited ? 'removed_from_favorites' : 'added_to_favorites ❤️',
      });
    }
  };

  const handleFork = async () => {
    if (!user) {
      toast({
        title: 'sign_in_required',
        description: 'Please sign in to fork this vault.',
        variant: 'destructive', feedbackSeverity: 'error',
      });
      return;
    }
    if (!vault || forking) return; // Prevent double-clicks
    
    setForking(true);
    try {
      const newVaultId = await forkVault(vault);
      if (newVaultId) {
        navigate(`/vault/${newVaultId}`);
      }
    } finally {
      setForking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex">
        {user && (
          <Sidebar
            vaults={[]}
            sharedVaults={[]}
            selectedVaultId={null}
            onSelectVault={() => {}}
            onCreateVault={() => {}}
            isMobileOpen={isMobileSidebarOpen}
            onMobileClose={() => setIsMobileSidebarOpen(false)}
            profile={profile}
            onEditProfile={() => {}}
          />
        )}
        
        <div className={`flex-1 ${user ? 'lg:pl-72' : ''} min-w-0 flex items-center justify-center`}>
          <div className="flex flex-col items-center gap-4">
            <BrandMark className="h-16 w-16 rounded-2xl shadow-lg animate-glow-pulse" />
            <p className="text-muted-foreground font-mono text-sm">// loading public vault...</p>
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex">
        {user && (
          <Sidebar
            vaults={[]}
            sharedVaults={[]}
            selectedVaultId={null}
            onSelectVault={() => {}}
            onCreateVault={() => {}}
            isMobileOpen={isMobileSidebarOpen}
            onMobileClose={() => setIsMobileSidebarOpen(false)}
            profile={profile}
            onEditProfile={() => {}}
          />
        )}
        
        <div className={`flex-1 ${user ? 'lg:pl-72' : ''} min-w-0 flex items-center justify-center`}>
          <div className="text-center space-y-6 p-8">
            <div className="w-20 h-20 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto shadow-lg">
              <Globe className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2 font-mono">vault_not_found</h1>
              <p className="text-muted-foreground font-mono text-sm">// no_public_vault_matches_this_slug</p>
            </div>
            <Link to="/">
              <Button variant="outline" className="font-mono mt-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                back_to_home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {user ? (
        <Sidebar
          vaults={userVaults}
          sharedVaults={sharedVaults}
          selectedVaultId={null}
          onSelectVault={(vaultId) => {
            if (vaultId) {
              navigate(`/vault/${vaultId}`);
            } else {
              navigate('/dashboard');
            }
          }}
          onCreateVault={() => navigate('/dashboard')}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
          profile={profile}
          onEditProfile={() => navigate('/profile/edit')}
        />
      ) : (
        // Show logo only for non-logged in users
        <div className="fixed top-0 left-0 right-0 z-50 border-b-2 border-border bg-card/50 backdrop-blur-xl">
          <div className="px-4 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <BrandMark className="h-10 w-10 shrink-0 rounded-xl shadow-lg" />
              <span className="font-bold text-lg">
                <span className="text-gradient">refhub</span>
                <span className="text-foreground/60">.io</span>
              </span>
            </Link>
            <Badge variant="neon" className="gap-1 font-mono">
              <Globe className="w-3 h-3" />
              public_vault
            </Badge>
          </div>
        </div>
      )}

      <div className={`flex-1 ${user ? 'lg:pl-72' : 'pt-20'} min-w-0`}>
        {/* Header with vault info and actions */}
        {vault && (
          <div className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-30">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <Badge variant="secondary" className="gap-1 font-mono text-xs shrink-0">
                    <Globe className="w-3 h-3" />
                    public
                  </Badge>
                  <VaultAccessBadge vaultId={vault.id} />
                  {/* Attribution badge — shown when this vault was itself forked */}
                  {forkInfo?.forkedFrom && (
                    <Badge variant="outline" className="gap-1 font-mono text-xs shrink-0 text-muted-foreground">
                      <GitFork className="w-3 h-3" />
                      <Link
                        to={getForkSourceHref(forkInfo.forkedFrom)}
                        className="hover:text-foreground transition-colors"
                      >
                        {getForkSourceLabel(forkInfo.forkedFrom)}
                      </Link>
                    </Badge>
                  )}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {lastUpdatedActivity?.profile
                        ? `${lastUpdatedActivity.profile.display_name || lastUpdatedActivity.profile.username || 'someone'}.last_update() // ${formatTimeAgo(lastUpdatedActivity.timestamp)}`
                        : `last_sync() // ${formatTimeAgo(lastUpdatedActivity?.timestamp || vault.updated_at)}`
                      }
                    </span>
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Fork count badge — always visible */}
                  {forkCount > 0 && (
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground font-mono border border-input rounded-md px-3 h-8">
                      <GitFork className="w-3.5 h-3.5" />
                      <span>{forkCount}_forks</span>
                    </div>
                  )}

                  {/* Stats for owner view */}
                  {user && vault.user_id === user.id ? (
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground font-mono border border-input rounded-md px-3 h-8">
                      <Heart className="w-3.5 h-3.5" />
                      <span>{favoritesCount}</span>
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleFavorite}
                        className={`font-mono h-8 ${vault && isFavorite(vault.id) ? 'text-rose-500 border-rose-500/30' : ''}`}
                      >
                        <Heart className={`w-4 h-4 ${vault && isFavorite(vault.id) ? 'fill-rose-500' : ''}`} />
                        <span className="ml-2 hidden md:inline">{vault && isFavorite(vault.id) ? 'favorited' : 'favorite'}</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleFork}
                        disabled={forking}
                        className="font-mono h-8"
                      >
                        <GitFork className="w-4 h-4" />
                        <span className="ml-2 hidden md:inline">
                          {forking ? 'forking...' : 'fork'}
                        </span>
                      </Button>
                      {user && !isOwner && !canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={hasPendingRequest && pendingRequestRole === 'editor'}
                          className="font-mono h-8"
                          title="Collaborate on this vault"
                          onClick={async () => {
                            try {
                              const { data: existingRequest } = await supabase
                                .from('vault_access_requests')
                                .select('id, status, requested_role')
                                .eq('vault_id', vault.id)
                                .eq('requester_id', user.id)
                                .in('status', ['pending', 'approved'])
                                .maybeSingle();

                              if (existingRequest?.status === 'pending') {
                                setHasPendingRequest(true);
                                setPendingRequestRole(existingRequest.requested_role === 'editor' ? 'editor' : 'viewer');
                                toast({
                                  title: 'Request Already Pending',
                                  description: existingRequest.requested_role === 'editor'
                                    ? 'Your edit access request is pending approval.'
                                    : 'You already have an access request pending approval.',
                                });
                                return;
                              }

                              if (existingRequest?.status === 'approved') {
                                toast({ title: 'Access Approved', description: 'You already have approved access.' });
                                return;
                              }

                              const result = await requestVaultAccess(vault.id, user.id, 'Requesting edit access to this public vault.', 'editor');
                              if (result.error) throw result.error;

                              setHasPendingRequest(true);
                              setPendingRequestRole('editor');
                              toast({
                                title: 'Edit Access Requested',
                                description: 'The vault owner has been notified.',
                              });
                            } catch (error) {
                              toast({
                                title: 'Error',
                                description: (error as Error).message,
                                variant: 'destructive', feedbackSeverity: 'error',
                              });
                            }
                          }}
                        >
                          <PencilLine className="w-4 h-4" />
                          <span className="ml-2 hidden md:inline">
                            {hasPendingRequest && pendingRequestRole === 'editor' ? 'collab requested' : 'collaborate'}
                          </span>
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PublicationList - READ-ONLY mode */}
        {vault && (
          <PublicationList
            publications={publications}
            tags={tags}
            vaults={[vault]}
            vaultOwnerName={vaultOwner?.display_name || vaultOwner?.username || undefined}
            publicationTagsMap={publicationTagsMap}
            relationsCountMap={relationsCountMap}
            selectedVault={vault}
            onOpenPublication={(pub) => setViewingPublication(pub)}
            onOpenGraph={() => setIsGraphOpen(true)}
            publicationActionLabel="view"
            onExportBibtex={(pubs) => {
              if (pubs.length > 0) {
                setExportPublications(pubs);
              }
            }}
            onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
            onVaultUpdate={() => {}}
          />
        )}

        <PublicationViewDialog
          open={!!viewingPublication}
          onOpenChange={(open) => {
            if (!open) {
              setViewingPublication(null);
            }
          }}
          publication={viewingPublication}
          tags={viewingPublication ? tags.filter((tag) => {
            const publicationTagIds = publicationTags
              .filter((pt) => (pt.vault_publication_id || pt.publication_id) === viewingPublication.id)
              .map((pt) => pt.tag_id);
            return publicationTagIds.includes(tag.id);
          }) : []}
          allTags={tags}
          publications={publications}
          relations={normalizedPublicationRelations}
          onEdit={canEdit && vault ? (publication) => {
            setViewingPublication(null);
            navigate(`/vault/${vault.id}`, {
              state: { publicationIdToEdit: publication.id },
            });
          } : undefined}
          onExport={(publication) => setExportPublications([publication])}
        />

        <ExportDialog
          open={exportPublications.length > 0}
          onOpenChange={(open) => {
            if (!open) {
              setExportPublications([]);
            }
          }}
          publications={exportPublications}
          vaultName={vault?.name}
          tags={tags}
          publicationTags={publicationTags}
        />

        <CollectionAnalytics
          open={isGraphOpen}
          onOpenChange={setIsGraphOpen}
          publications={publications}
          relations={normalizedPublicationRelations}
          tags={tags}
          publicationTags={publicationTags}
          onSelectPublication={(publication) => setViewingPublication(publication)}
        />
      </div>
    </div>
  );
}
