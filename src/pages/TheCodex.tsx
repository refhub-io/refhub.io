import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Vault, VAULT_CATEGORIES } from '@/types/database';
import { topicToSlug } from '@/lib/codexDiscovery';
import { CODEX_PAGE_SIZE, fetchCodexTopicSuggestions, fetchCodexVaultsPage, type CodexVault, type CodexVaultsCursor } from '@/lib/codexVaults';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { VirtualCardGrid } from '@/components/layout/VirtualCardGrid';
import { CodexVaultCard } from '@/components/codex/CodexVaultCard';
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
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';
import { SidebarDndBoundary } from '@/components/layout/SidebarDndBoundary';
import { ProfileDialog } from '@/components/profile/ProfileDialog';
import { VaultDialog } from '@/components/vaults/VaultDialog';
import { getPageCache, setPageCache, hasPageCache } from '@/lib/pageCache';
import { 
  Search, 
  FolderOpen,
  Clock,
  Filter,
  Scroll,
  Library,
  Menu
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

interface CodexCache {
  vaults: CodexVault[];
  total: number;
  next: CodexVaultsCursor | null;
  categories: string[];
  topics: string[];
}

// A realtime refresh reloads every card already shown, up to the function's page limit.
const MAX_REFRESH = 200;

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
  // Every vault matching the search and category, and where the next page starts.
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<CodexVaultsCursor | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
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

  // The database searches, filters, counts and pages the vaults (#275). The grid used to download
  // every public vault plus one row per paper, favorite and fork in them, so past 1,000 rows its
  // counts were wrong.
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const category = categoryFilter === 'all' ? null : categoryFilter;
  // The newest first-page request. An older one's answer, or a page loaded for it, is dropped.
  const requestRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const vaultCountRef = useRef(0);
  vaultCountRef.current = vaults.length;

  const loadFirstPage = useCallback(async ({ silent = false, limit = CODEX_PAGE_SIZE } = {}) => {
    const request = ++requestRef.current;
    if (!silent) setLoading(true);
    try {
      const page = await fetchCodexVaultsPage(supabase, { search: debouncedSearch, category, limit });
      if (request !== requestRef.current) return;
      setVaults(page.vaults);
      setTotal(page.total);
      setNextCursor(page.next);
      if (page.categories) setCategories(page.categories);
    } catch (error) {
      logger.error('TheCodex', 'Error fetching public vaults:', error);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [debouncedSearch, category]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    const request = requestRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchCodexVaultsPage(supabase, { search: debouncedSearch, category, after: nextCursor });
      if (request !== requestRef.current) return;
      setVaults((current) => [...current, ...page.vaults.filter((v) => !current.some((c) => c.id === v.id))]);
      setTotal(page.total);
      setNextCursor(page.next);
    } catch (error) {
      logger.error('TheCodex', 'Error fetching more public vaults:', error);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [nextCursor, debouncedSearch, category]);

  // The first page, again whenever the search or the category changes. Only a first visit without
  // a cache shows the loader; afterwards the cards stay until the new ones arrive.
  const shownOnceRef = useRef(hasCachedData.current);
  useEffect(() => {
    void loadFirstPage({ silent: shownOnceRef.current });
    shownOnceRef.current = true;
  }, [loadFirstPage]);

  // Topic suggestions for the search, from the database.
  useEffect(() => {
    let cancelled = false;
    setTopicSuggestionsLoading(true);
    fetchCodexTopicSuggestions(supabase, debouncedSearch)
      .then((suggestions) => { if (!cancelled) setTopicSuggestions(suggestions.map((s) => s.topic)); })
      .catch((error) => logger.error('TheCodex', 'Error fetching topic suggestions:', error))
      .finally(() => { if (!cancelled) setTopicSuggestionsLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  // Save to cache whenever the unfiltered first view changes
  useEffect(() => {
    if (user && vaults.length > 0 && !loading && !debouncedSearch && !category) {
      setPageCache<CodexCache>('codex', { vaults, total, next: nextCursor, categories, topics: topicSuggestions }, user.id);
    }
  }, [user, vaults, total, nextCursor, categories, topicSuggestions, loading, debouncedSearch, category]);

  // Restore from cache on mount if available
  useEffect(() => {
    if (hasCachedData.current && user) {
      const cached = getPageCache<CodexCache>('codex', user.id);
      if (cached?.vaults) {
        setVaults(cached.vaults);
        setTotal(cached.total ?? cached.vaults.length);
        setNextCursor(cached.next ?? null);
        setCategories(cached.categories ?? []);
        setTopicSuggestions(cached.topics ?? []);
      }
    }
  }, [user]);

  // Any change to a vault the viewer can see reloads the cards shown, once things settle.
  const loadFirstPageRef = useRef(loadFirstPage);
  loadFirstPageRef.current = loadFirstPage;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel('public-vaults-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vaults',
        },
        () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            void loadFirstPageRef.current({ silent: true, limit: Math.min(MAX_REFRESH, Math.max(CODEX_PAGE_SIZE, vaultCountRef.current)) });
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

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
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
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
        ) : vaults.length === 0 ? (
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
                // {total} collection{total !== 1 ? 's' : ''} found
              </p>
            </div>
            <VirtualCardGrid
              items={vaults}
              getKey={(vault) => vault.id}
              onEndReached={loadMore}
              renderItem={(vault) => (
                <CodexVaultCard
                  vault={vault}
                  canAct={!!user}
                  isOwn={!!user && vault.user_id === user.id}
                  favorite={isFavorite(vault.id)}
                  forking={forkingId === vault.id}
                  onFavorite={handleFavorite}
                  onFork={handleFork}
                />
              )}
            />
            {loadingMore && (
              <div className="flex justify-center py-6">
                <LoadingSpinner />
              </div>
            )}
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
