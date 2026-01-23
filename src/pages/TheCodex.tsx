import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Vault, VaultStats, VAULT_CATEGORIES } from '@/types/database';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useVaultFavorites } from '@/hooks/useVaultFavorites';
import { useVaultFork } from '@/hooks/useVaultFork';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SpinnerLoader } from '@/components/ui/loader';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';
import { Sidebar } from '@/components/layout/Sidebar';
import { 
  BookOpen,
  Search, 
  FolderOpen,
  ArrowRight,
  Eye,
  Download,
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
  owner?: {
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
    username: string | null;
  };
}

export default function TheCodex() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isFavorite, toggleFavorite } = useVaultFavorites();
  const { forkVault } = useVaultFork();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [vaults, setVaults] = useState<CodexVault[]>([]);
  const [userVaults, setUserVaults] = useState<Vault[]>([]);
  const [sharedVaults, setSharedVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const fetchPublicVaults = async () => {
    setLoading(true);
    try {
      // Fetch public vaults with owner info
      const { data: vaultsData, error: vaultsError } = await supabase
        .from('vaults')
        .select('*')
        .eq('is_public', true)
        .order('updated_at', { ascending: false });

      if (vaultsError || !vaultsData) {
        setLoading(false);
        return;
      }

      // Fetch additional data for each vault
      const vaultsWithData = await Promise.all(
        vaultsData.map(async (vault) => {
          // Get publication count
          const { count } = await supabase
            .from('publications')
            .select('*', { count: 'exact', head: true })
            .eq('vault_id', vault.id);

          // Get stats
          const { data: statsData } = await supabase
            .from('vault_stats')
            .select('*')
            .eq('vault_id', vault.id)
            .maybeSingle();

          // Get owner info
          const { data: profileData } = await supabase
            .from('profiles')
            .select('display_name, email, avatar_url, username')
            .eq('user_id', vault.user_id)
            .maybeSingle();

          return {
            ...vault,
            publication_count: count || 0,
            stats: statsData as VaultStats | undefined,
            owner: profileData || undefined,
          } as CodexVault;
        })
      );

      setVaults(vaultsWithData);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const fetchUserVaults = useCallback(async () => {
    if (!user) return;
    
    try {
      // Fetch owned vaults
      const { data: ownedVaultsData } = await supabase
        .from('vaults')
        .select('*')
        .eq('user_id', user.id)
        .order('name');
      
      if (ownedVaultsData) {
        setUserVaults(ownedVaultsData as Vault[]);
      }

      // Fetch shared vaults
      const { data: sharedVaultsData } = await supabase
        .from('vault_shares')
        .select('vault_id')
        .or(`shared_with_email.eq."${user.email}",shared_with_user_id.eq.${user.id}`);
      
      if (sharedVaultsData && sharedVaultsData.length > 0) {
        const sharedVaultIds = sharedVaultsData.map(s => s.vault_id);
        const { data: sharedVaultDetails } = await supabase
          .from('vaults')
          .select('*')
          .in('id', sharedVaultIds)
          .neq('user_id', user.id);
        
        if (sharedVaultDetails) {
          setSharedVaults(sharedVaultDetails as Vault[]);
        }
      }
    } catch (error) {
    }
  }, [user]);

  useEffect(() => {
    fetchPublicVaults();
    if (user) {
      fetchUserVaults();
    }
  }, [user, fetchUserVaults]);

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
        variant: 'destructive',
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
        variant: 'destructive',
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
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      {user && (
        <Sidebar
          vaults={userVaults}
          sharedVaults={sharedVaults}
          selectedVaultId={null}
          onSelectVault={(vaultId) => {
            if (vaultId) {
              navigate('/');
            } else {
              navigate('/');
            }
          }}
          onCreateVault={() => navigate('/')}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
          profile={profile}
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
              <p className="text-muted-foreground max-w-2xl mx-auto text-lg mb-2">
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
            </div>
          </div>

          {/* Content */}
          <main className="w-full">
            <div className="px-4 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <SpinnerLoader className="w-12 h-12" />
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
                  <article className="h-full p-6 rounded-2xl border-2 border-border bg-card/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 flex flex-col">
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
                    {vault.category && (
                      <Badge variant="secondary" className="w-fit mb-3 text-xs font-mono">
                        {vault.category.toLowerCase().replace(/\s+/g, '_')}
                      </Badge>
                    )}

                    {/* Description/Abstract */}
                    {(vault.abstract || vault.description) && (
                      <div className="mb-4 flex-1">
                        <p className="text-xs text-muted-foreground/60 font-mono mb-1">// description</p>
                        <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                          {vault.abstract || vault.description}
                        </p>
                      </div>
                    )}

                    {/* Stats Row */}
                    <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground mb-4 pt-3 border-t border-border/50">
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{vault.publication_count}_papers</span>
                      </div>
                      <span className="text-muted-foreground/30">|</span>
                      <div className="flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5" />
                        <span>{vault.stats?.view_count || 0}_views</span>
                      </div>
                      <span className="text-muted-foreground/30">|</span>
                      <div className="flex items-center gap-1.5">
                        <Download className="w-3.5 h-3.5" />
                        <span>{vault.stats?.download_count || 0}</span>
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
    </div>
  );
}