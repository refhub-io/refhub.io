import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag } from '@/types/database';
import { formatTimeAgo } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useVaultFavorites } from '@/hooks/useVaultFavorites';
import { useVaultFork } from '@/hooks/useVaultFork';
import { Sidebar } from '@/components/layout/Sidebar';
import { PublicationList } from '@/components/publications/PublicationList';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  ArrowLeft,
  Globe,
  Heart,
  GitFork,
  Eye,
  Clock
} from 'lucide-react';

export default function PublicVault() {
  const { slug } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isFavorite, toggleFavorite } = useVaultFavorites();
  const { forkVault } = useVaultFork();
  const navigate = useNavigate();
  const [vault, setVault] = useState<Vault | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [publicationTags, setPublicationTags] = useState<PublicationTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [forking, setForking] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [userVaults, setUserVaults] = useState<Vault[]>([]);
  const [sharedVaults, setSharedVaults] = useState<Vault[]>([]);

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
      console.error('Error fetching user vaults:', error);
    }
  }, [user]);

  // Fetch public vault
  const fetchPublicVault = useCallback(async () => {
    if (!slug) return;
    
    setLoading(true);
    try {
      // First, try to find a public vault with this slug
      const { data: vaultData, error } = await supabase
        .from('vaults')
        .select('*')
        .eq('public_slug', slug)
        .eq('visibility', 'public')
        .maybeSingle();

      if (error) {
        console.error('[PublicVault] Error fetching vault:', error);
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
          console.log('[PublicVault] Vault is no longer public, redirecting to vault page');
          navigate(`/vault/${anyVault.id}`, { replace: true });
          return;
        }
        
        setNotFound(true);
        return;
      }

      setVault(vaultData);

      // Increment view count
      await supabase.rpc('increment_vault_views', { vault_uuid: vaultData.id });

      // Fetch publications via vault_publications
      const { data: vaultPublicationsData } = await supabase
        .from('vault_publications')
        .select('*')
        .eq('vault_id', vaultData.id);
      
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
          created_at: vp.created_at,
          updated_at: vp.updated_at,
        }));
        setPublications(pubsData);
        
        // Fetch tags using vault_publication_id
        const vaultPubIds = pubsData.map(p => p.id);
        if (vaultPubIds.length > 0) {
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
            }
          }
        }
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

  const handleFavorite = async () => {
    if (!user) {
      toast({
        title: 'sign_in_required',
        description: 'Please sign in to favorite this vault.',
        variant: 'destructive',
      });
      return;
    }
    if (!vault) return;
    
    const success = await toggleFavorite(vault.id);
    if (success) {
      toast({
        title: isFavorite(vault.id) ? 'removed_from_favorites' : 'added_to_favorites ❤️',
      });
    }
  };

  const handleFork = async () => {
    if (!user) {
      toast({
        title: 'sign_in_required',
        description: 'Please sign in to fork this vault.',
        variant: 'destructive',
      });
      return;
    }
    if (!vault) return;
    
    setForking(true);
    const newVault = await forkVault(vault);
    setForking(false);
    
    if (newVault) {
      navigate('/dashboard');
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
            <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg glow-purple animate-glow-pulse">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
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
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
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
            <div className="max-w-6xl mx-auto px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="secondary" className="gap-1 font-mono text-xs shrink-0">
                    <Globe className="w-3 h-3" />
                    public
                  </Badge>
                  <Badge className="gap-1 font-mono text-xs shrink-0 border-blue-500/50 bg-blue-500/10 text-blue-500 hover:bg-blue-500/10">
                    <Eye className="w-3 h-3" />
                    viewer
                  </Badge>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    last_sync // {formatTimeAgo(vault.updated_at)}
                  </span>
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
                    <span className="ml-2 hidden md:inline">fork</span>
                  </Button>
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
            publicationTagsMap={(() => {
              // Create a map from vault publication IDs to tags
              const vaultPubTagsMap: Record<string, string[]> = {};
              publicationTags.forEach(pt => {
                // Use vault_publication_id if available, otherwise fall back to publication_id
                const vaultPubId = pt.vault_publication_id || pt.publication_id;
                if (!vaultPubTagsMap[vaultPubId]) vaultPubTagsMap[vaultPubId] = [];
                vaultPubTagsMap[vaultPubId].push(pt.tag_id);
              });

              // Create a map from publication IDs to tags
              const pubTagsMap: Record<string, string[]> = {};
              publications.forEach(pub => {
                // In the copy-based model, publications are vault-specific copies
                // Look up the tags using the vault publication ID
                pubTagsMap[pub.id] = vaultPubTagsMap[pub.id] || [];
              });

              return pubTagsMap;
            })()}
            relationsCountMap={{}}
            selectedVault={vault}
            onExportBibtex={(pubs) => {
              if (pubs.length > 0 && vault) {
                // Increment download count
                supabase.rpc('increment_vault_downloads', { vault_uuid: vault.id });
                toast({ title: `exported_${pubs.length}_references 📄` });
              }
            }}
            onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
            onVaultUpdate={() => {}}
          />
        )}
      </div>
    </div>
  );
}