import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { useState, useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Vault, VaultStats, VAULT_CATEGORIES } from '@/types/database';
import { normalizeTopic, topicToSlug } from '@/lib/codexDiscovery';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useVaults, useInvalidateVaults } from '@/hooks/useVaults';
import { useVaultFavorites } from '@/hooks/useVaultFavorites';
import { useVaultFork } from '@/hooks/useVaultFork';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';
import { SidebarDndBoundary } from '@/components/layout/SidebarDndBoundary';
import { ProfileDialog } from '@/components/profile/ProfileDialog';
import { VaultDialog } from '@/components/vaults/VaultDialog';
import VaultAbstractBlock from '@/components/vaults/VaultAbstractBlock';
import { getPageCache, setPageCache, hasPageCache } from '@/lib/pageCache';
import { 
  BookOpen,
  Search, 
  FolderOpen,
  ArrowRight,
  Eye,
  Clock,
  Filter,
  Scroll,
  Library,
  Heart,
  GitFork,
  Menu
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDistanceToNow } from 'date-fns';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

interface CodexVault extends Vault {
  publication_count?: number;
  stats?: VaultStats;
  favorites_count?: number;
  fork_count?: number;
  is_fork?: boolean;
  owner?: {
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
    username: string | null;
  };
}

interface CodexCache {
  vaults: CodexVault[];
}

export default function TheCodex() {
  const { user } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const { isFavorite, toggleFavorite } = useVaultFavorites();
  const { forkVault } = useVaultFork();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // Check for cached data to skip loading screen on return visits
  const hasCachedData = useRef(hasPageCache('codex'));
  
  const [vaults, setVaults] = useState<CodexVault[]>([]);
  const { ownedVaults: userVaults, sharedVaults } = useVaults();
  const invalidateVaults = useInvalidateVaults();
  const [loading, setLoading] = useState(!hasCachedData.current);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [editingVault, setEditingVault] = useState<Vault | null>(null);
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  const [topicSuggestionsLoading, setTopicSuggestionsLoading] = useState(false);

  const fetchPublicVaults = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Fetch public vaults with owner info
      const { data: vaultsData, error: vaultsError } = await supabase
        .from('vaults')
        .select('*')
        .eq('visibility', 'public')
        .order('updated_at', { ascending: false });

      if (vaultsError || !vaultsData) {
        setLoading(false);
        return;
      }

      const vaultIds = vaultsData.map((vault) => vault.id);
      const ownerIds = [...new Set(vaultsData.map((vault) => vault.user_id))];

      // Batched: one query per data source across ALL public vaults, instead
      // of the previous 5-queries-PER-vault fan-out (N public vaults meant
      // 5N round trips). Each result is grouped/counted client-side by
      // vault_id below.
      const [
        forkedVaultRows,
        vaultPubRows,
        statsRows,
        favoriteRows,
        forkCountRows,
        profileRows,
      ] = vaultIds.length === 0
        ? [[], [], [], [], [], []]
        : await Promise.all([
            supabase.from('vault_forks').select('forked_vault_id').in('forked_vault_id', vaultIds)
              .then((res) => res.data || []),
            supabase.from('vault_publications').select('vault_id').in('vault_id', vaultIds)
              .then((res) => res.data || []),
            supabase.from('vault_stats').select('*').in('vault_id', vaultIds)
              .then((res) => res.data || []),
            supabase.from('vault_favorites').select('vault_id').in('vault_id', vaultIds)
              .then((res) => res.data || []),
            supabase.from('vault_forks').select('original_vault_id').in('original_vault_id', vaultIds)
              .then((res) => res.data || []),
            supabase.from('profiles').select('user_id, display_name, email, avatar_url, username').in('user_id', ownerIds)
              .then((res) => res.data || []),
          ]);

      const countBy = (rows: Record<string, unknown>[], key: string): Map<string, number> => {
        const counts = new Map<string, number>();
        rows.forEach((row) => {
          const id = row[key] as string;
          counts.set(id, (counts.get(id) || 0) + 1);
        });
        return counts;
      };

      const forkedVaultIds = new Set((forkedVaultRows as { forked_vault_id: string }[]).map((row) => row.forked_vault_id));
      const publicationCounts = countBy(vaultPubRows as Record<string, unknown>[], 'vault_id');
      const favoritesCounts = countBy(favoriteRows as Record<string, unknown>[], 'vault_id');
      const forkCounts = countBy(forkCountRows as Record<string, unknown>[], 'original_vault_id');
      const statsByVaultId = new Map((statsRows as VaultStats[]).map((s) => [s.vault_id, s]));
      const profilesByUserId = new Map((profileRows as { user_id: string; display_name: string | null; email: string | null; avatar_url: string | null; username: string | null }[]).map((p) => [p.user_id, p]));

      const vaultsWithData: CodexVault[] = vaultsData.map((vault) => ({
        ...vault,
        publication_count: publicationCounts.get(vault.id) || 0,
        stats: statsByVaultId.get(vault.id),
        favorites_count: favoritesCounts.get(vault.id) || 0,
        fork_count: forkCounts.get(vault.id) || 0,
        is_fork: forkedVaultIds.has(vault.id),
        owner: profilesByUserId.get(vault.user_id),
      }));

      setVaults(vaultsWithData);
      fetchTopicSuggestions(vaultIds);
    } catch (error) {
      logger.error('TheCodex', 'Error fetching public vaults:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTopicSuggestions = async (publicVaultIds: string[]) => {
    if (publicVaultIds.length === 0) {
      setTopicSuggestions([]);
      return;
    }
    setTopicSuggestionsLoading(true);
    try {
      const { data: vaultPubs } = await supabase
        .from('vault_publications')
        .select('id, keywords')
        .in('vault_id', publicVaultIds);
      const pubIds = (vaultPubs || []).map((p) => p.id);

      const topics = new Set<string>();
      (vaultPubs || []).forEach((p) => (p.keywords || []).forEach((k: string) => topics.add(normalizeTopic(k))));

      if (pubIds.length > 0) {
        const { data: pubTags } = await supabase.from('publication_tags').select('tag_id').in('vault_publication_id', pubIds);
        const tagIds = [...new Set((pubTags || []).map((pt) => pt.tag_id))];
        if (tagIds.length > 0) {
          const { data: tagRows } = await supabase.from('tags').select('name').in('id', tagIds);
          (tagRows || []).forEach((t) => topics.add(normalizeTopic(t.name)));
        }
      }

      // Keep the FULL set here — the display cap is applied after filtering
      // by searchQuery at render time, otherwise search-as-you-type could
      // never find a topic that happened to sort past this cutoff.
      setTopicSuggestions(Array.from(topics).sort());
    } catch (error) {
      logger.error('TheCodex', 'Error fetching topic suggestions:', error);
    } finally {
      setTopicSuggestionsLoading(false);
    }
  };

  // Save to cache whenever data changes
  useEffect(() => {
    if (user && vaults.length > 0 && !loading) {
      setPageCache<CodexCache>('codex', { vaults }, user.id);
    }
  }, [user, vaults, loading]);

  // Restore from cache on mount if available
  useEffect(() => {
    if (hasCachedData.current && user) {
      const cached = getPageCache<CodexCache>('codex', user.id);
      if (cached) {
        setVaults(cached.vaults);
      }
    }
  }, [user]);

  useEffect(() => {
    // If we have cached data, do a silent refresh in the background
    const isSilent = hasCachedData.current;
    fetchPublicVaults(isSilent);

    // Subscribe to realtime changes for vaults table
    // Since we query with visibility='public', any change will naturally filter correctly
    const channel = supabase
      .channel('public-vaults-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vaults',
        },
        (payload) => {

          // Simply refetch on any vault change - the query filters by visibility='public'
          // so vaults that become private will automatically disappear
          fetchPublicVaults();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredVaults = vaults.filter((vault) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      vault.name.toLowerCase().includes(query) ||
      vault.description?.toLowerCase().includes(query) ||
      vault.abstract?.toLowerCase().includes(query) ||
      vault.category?.toLowerCase().includes(query);
    
    const matchesCategory = categoryFilter === 'all' || vault.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const uniqueCategories = [...new Set(vaults.map(v => v.category).filter(Boolean))];

  const getOwnerInitials = (owner?: CodexVault['owner']) => {
    if (!owner) return '?';
    if (owner.display_name) {
      return owner.display_name.slice(0, 2).toUpperCase();
    }
    if (owner.email) {
      return owner.email.slice(0, 2).toUpperCase();
    }
    return '?';
  };

  const getOwnerName = (owner?: CodexVault['owner']) => {
    if (!owner) return 'Unknown';
    return owner.display_name || owner.email?.split('@')[0] || 'Unknown';
  };

  const handleFavorite = async (e: React.MouseEvent, vaultId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!user) {
      toast({
        title: 'sign_in_required',
        description: 'Please sign in to favorite this vault.',
        variant: 'destructive', feedbackSeverity: 'error',
      });
      return;
    }
    
    const success = await toggleFavorite(vaultId);
    if (success) {
      toast({
        title: isFavorite(vaultId) ? 'removed_from_favorites' : 'added_to_favorites ❤️',
      });
    }
  };

  const handleFork = async (e: React.MouseEvent, vault: CodexVault) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!user) {
      toast({
        title: 'sign_in_required',
        description: 'Please sign in to fork this vault.',
        variant: 'destructive', feedbackSeverity: 'error',
      });
      return;
    }

    // Don't allow forking own vaults
    if (vault.user_id === user.id) {
      toast({
        title: 'cannot_fork_own_vault',
        description: 'You already own this vault.',
      });
      return;
    }
    
    setForkingId(vault.id);
    const newVault = await forkVault(vault as Vault);
    setForkingId(null);

    if (newVault) {
      void invalidateVaults();
      navigate('/dashboard');
    }
  };

  const handleSaveVault = async (data: Partial<Vault>) => {
    if (!editingVault) return;
    const { data: updated, error } = await supabase
      .from('vaults')
      .update(data)
      .eq('id', editingVault.id)
      .select()
      .single();
    if (error) throw error;
    void invalidateVaults();
    setEditingVault(updated as Vault);
    return updated as Vault;
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      {user && (
        <SidebarDndBoundary
          vaults={userVaults}
          sharedVaults={sharedVaults}
          selectedVaultId={null}
          onSelectVault={(vaultId) => {
            if (vaultId) navigate(`/vault/${vaultId}`);
            else navigate('/dashboard');
          }}
          onCreateVault={() => navigate('/dashboard?createVault=1')}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
          profile={profile}
          onEditProfile={() => setIsProfileDialogOpen(true)}
          onEditVault={(vault) => {
            setEditingVault(vault);
            setIsVaultDialogOpen(true);
          }}
        />
      )}

      {/* Main content */}
      <div className={`flex-1 ${user ? 'lg:pl-72' : ''}`}>
        <div className="min-h-screen flex flex-col">
          {/* Mobile menu button - fixed position */}
          {user && !isMobileSidebarOpen && (
            <MobileMenuButton 
              onClick={() => setIsMobileSidebarOpen(true)}
              className="fixed top-4 left-4 z-50"
            />
          )}
          {/* Hero */}
          <div className="w-full border-b-2 border-border bg-gradient-to-b from-amber-500/5 via-orange-500/5 to-background">
            <div className="px-4 lg:px-8 py-16 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 mb-6">
                <Library className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-500 font-mono">public_research_marketplace</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-bold mb-4 font-mono">
                <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-red-500 bg-clip-text text-transparent">the_codex</span>
              </h1>
              <p className="text-muted-foreground font-mono max-w-2xl mx-auto text-lg mb-2">
                discover curated literature collections from researchers worldwide
              </p>
              <p className="text-muted-foreground/70 font-mono text-sm">
                // browse • learn • cite
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="w-full border-b border-border bg-card/30">
            <div className="px-4 lg:px-8 py-4">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                <div className="relative flex-1 max-w-2xl w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="search_collections..."
                    className="pl-10 font-mono"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="all_categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">all_categories</SelectItem>
                      {uniqueCategories.map((category) => (
                        <SelectItem key={category} value={category!}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {topicSuggestionsLoading && topicSuggestions.length === 0 && (
                <div className="flex items-center justify-center mt-3 text-xs text-muted-foreground font-mono">
                  loading_topics...
                </div>
              )}
              {topicSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 w-full justify-center">
                  {topicSuggestions
                    .filter((t) => !searchQuery || t.includes(searchQuery.toLowerCase()))
                    .slice(0, 12)
                    .map((topic) => (
                      <Link key={topic} to={`/codex/topic/${topicToSlug(topic)}`}>
                        <Badge variant="secondary" className="font-mono text-xs hover:opacity-80">{topic}</Badge>
                      </Link>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <main className="w-full">
            <div className="px-4 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <LoadingSpinner size="lg" />
              <p className="text-muted-foreground font-mono text-sm">// loading the codex...</p>
            </div>
          </div>
        ) : filteredVaults.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground font-mono text-lg mb-2">
              {searchQuery || categoryFilter !== 'all' 
                ? '// no collections match your search' 
                : '// the codex awaits its first entry'}
            </p>
            <p className="text-muted-foreground/60 text-sm font-mono">
              publish your vault to share it with the world
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-muted-foreground font-mono">
                // {filteredVaults.length} collection{filteredVaults.length !== 1 ? 's' : ''} found
              </p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredVaults.map((vault) => (
                <Link
                  key={vault.id}
                  to={`/public/${vault.public_slug}`}
                  className="group"
                >
                  <article
                    className={`h-full p-6 rounded-2xl border-2 bg-card/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 flex flex-col ${vault.is_fork ? 'bg-amber-500/[0.03]' : ''}`}
                    style={{ borderColor: `${vault.color}40` }}
                  >
                    {/* Header with owner info */}
                    <div className="flex items-start gap-3 mb-4">
                      <Avatar className="w-10 h-10 border-2 border-border ring-2 ring-background group-hover:ring-primary/20 transition-all">
                        {vault.owner?.avatar_url ? (
                          <img src={vault.owner.avatar_url} alt={getOwnerName(vault.owner)} className="object-cover" />
                        ) : (
                          <AvatarFallback className="text-xs font-mono bg-gradient-to-br from-primary/20 to-primary/10">
                            {getOwnerInitials(vault.owner)}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-muted-foreground font-mono truncate">
                            {vault.owner?.username ? `@${vault.owner.username}` : getOwnerName(vault.owner)}
                          </span>
                          <span className="text-xs text-muted-foreground/50">•</span>
                          <span className="text-xs text-muted-foreground/70 font-mono">
                            {formatDistanceToNow(new Date(vault.updated_at), { addSuffix: true })}
                          </span>
                        </div>
                        <h2 className="font-bold text-lg group-hover:text-primary transition-colors line-clamp-1 font-mono">
                          {vault.name}
                        </h2>
                      </div>
                      <div 
                        className="w-8 h-8 rounded-lg shrink-0 shadow-sm group-hover:scale-110 transition-transform flex items-center justify-center"
                        style={{ backgroundColor: vault.color }}
                      >
                        <BookOpen className="w-4 h-4 text-white/90" />
                      </div>
                    </div>

                    {/* Category Badge */}
                    <div className="mb-3 flex flex-wrap gap-2">
                      {vault.is_fork && (
                        <Badge variant="outline" className="w-fit text-xs font-mono border-amber-500/30 text-amber-600">
                          forked
                        </Badge>
                      )}
                      {vault.category && (
                        <Badge variant="secondary" className="w-fit text-xs font-mono">
                          {vault.category.toLowerCase().replace(/\s+/g, '_')}
                        </Badge>
                      )}
                    </div>

                    {/* Description/Abstract */}
                    {(vault.abstract || vault.description) && (
                      <div className="mb-4 flex-1">
                        <VaultAbstractBlock abstract={vault.abstract} description={vault.description} />
                      </div>
                    )}

                    {/* Stats Row */}
                    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/50 pt-3 text-xs font-mono text-muted-foreground">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <BookOpen className="h-3.5 w-3.5 shrink-0" />
                        <span className="break-all">{vault.publication_count}_papers</span>
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5 shrink-0" />
                        <span className="break-all">{vault.stats?.view_count || 0}_views</span>
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Heart className="h-3.5 w-3.5 shrink-0" />
                        <span className="break-all">{vault.favorites_count || 0}_favorites</span>
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <GitFork className="h-3.5 w-3.5 shrink-0" />
                        <span className="break-all">{vault.fork_count || 0}_forks</span>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {user && (
                          <>
                            <button
                              onClick={(e) => handleFavorite(e, vault.id)}
                              disabled={vault.user_id === user.id}
                              className={`p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isFavorite(vault.id) ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500'}`}
                              title={vault.user_id === user.id ? 'you_own_this_vault' : undefined}
                            >
                              <Heart className={`w-4 h-4 ${isFavorite(vault.id) ? 'fill-rose-500' : ''}`} />
                            </button>
                            <button
                              onClick={(e) => handleFork(e, vault)}
                              disabled={forkingId === vault.id || vault.user_id === user.id}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title={vault.user_id === user.id ? 'you_own_this_vault' : undefined}
                            >
                              <GitFork className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                      <div className="flex items-center text-sm text-primary font-semibold group-hover:gap-2 transition-all font-mono">
                        explore
                        <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </>
        )}
            </div>
          </main>
        </div>
      </div>

      <ProfileDialog
        open={isProfileDialogOpen}
        onOpenChange={(open) => {
          setIsProfileDialogOpen(open);
          if (!open) {
            void refetchProfile();
          }
        }}
      />

      <VaultDialog
        open={isVaultDialogOpen}
        onOpenChange={setIsVaultDialogOpen}
        vault={editingVault}
        onSave={handleSaveVault}
        onUpdate={() => {}}
      />
    </div>
  );
}
