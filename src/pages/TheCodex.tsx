import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Vault, VaultStats, VAULT_CATEGORIES } from '@/types/database';
import { useAuth } from '@/hooks/useAuth';
import { useVaultFavorites } from '@/hooks/useVaultFavorites';
import { useVaultFork } from '@/hooks/useVaultFork';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';
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
  GitFork
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDistanceToNow } from 'date-fns';

interface CodexVault extends Vault {
  publication_count?: number;
  stats?: VaultStats;
  owner?: {
    display_name: string | null;
    email: string | null;
  };
}

export default function TheCodex() {
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useVaultFavorites();
  const { forkVault } = useVaultFork();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [vaults, setVaults] = useState<CodexVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [forkingId, setForkingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicVaults();
  }, []);

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
        console.error('Error fetching vaults:', vaultsError);
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
            .select('display_name, email')
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
      console.error('Error fetching public vaults:', error);
    } finally {
      setLoading(false);
    }
  };

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
        title: 'Sign in required',
        description: 'Please sign in to favorite this vault.',
        variant: 'destructive',
      });
      return;
    }
    
    const success = await toggleFavorite(vaultId);
    if (success) {
      toast({
        title: isFavorite(vaultId) ? 'Removed from favorites' : 'Added to favorites ❤️',
      });
    }
  };

  const handleFork = async (e: React.MouseEvent, vault: CodexVault) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to fork this vault.',
        variant: 'destructive',
      });
      return;
    }

    // Don't allow forking own vaults
    if (vault.user_id === user.id) {
      toast({
        title: 'Cannot fork own vault',
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-2 border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-red-600 flex items-center justify-center shadow-lg">
              <Scroll className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">
              <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-red-500 bg-clip-text text-transparent">The Codex</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {user && <NotificationDropdown />}
            <Link to="/">
              <Button variant="outline" size="sm">
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="border-b-2 border-border bg-gradient-to-b from-amber-500/5 via-orange-500/5 to-background">
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 mb-6">
            <Library className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-500">Public Research Marketplace</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-red-500 bg-clip-text text-transparent">The Codex</span>
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg mb-2">
            Discover curated literature collections from researchers worldwide
          </p>
          <p className="text-muted-foreground/70 font-mono text-sm">
            // browse • learn • cite
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-border bg-card/30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search collections..."
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-3">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
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
      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-red-600 flex items-center justify-center shadow-lg animate-pulse">
                <Scroll className="w-8 h-8 text-white" />
              </div>
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
            <p className="text-muted-foreground/60 text-sm">
              Publish your vault to share it with the world
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
                  <article className="h-full p-6 rounded-2xl border-2 border-border bg-card/50 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-300 flex flex-col">
                    {/* Header */}
                    <div className="flex items-start gap-4 mb-4">
                      <div 
                        className="w-14 h-14 rounded-xl shrink-0 shadow-lg group-hover:scale-105 transition-transform flex items-center justify-center"
                        style={{ backgroundColor: vault.color }}
                      >
                        <BookOpen className="w-6 h-6 text-white/90" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-lg mb-1 group-hover:text-amber-500 transition-colors line-clamp-1">
                          {vault.name}
                        </h2>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-5 h-5">
                            <AvatarFallback className="text-[10px] bg-muted">
                              {getOwnerInitials(vault.owner)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground truncate">
                            {getOwnerName(vault.owner)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Category Badge */}
                    {vault.category && (
                      <Badge variant="secondary" className="w-fit mb-3 text-xs">
                        {vault.category}
                      </Badge>
                    )}

                    {/* Abstract/Description */}
                    {(vault.abstract || vault.description) && (
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2 flex-1">
                        {vault.abstract || vault.description}
                      </p>
                    )}

                    {/* Stats Row */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4 pt-3 border-t border-border">
                      <div className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{vault.publication_count} papers</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        <span>{vault.stats?.view_count || 0} views</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Download className="w-3.5 h-3.5" />
                        <span>{vault.stats?.download_count || 0}</span>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                        <Clock className="w-3 h-3" />
                        <span>
                          {formatDistanceToNow(new Date(vault.updated_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {user && vault.user_id !== user.id && (
                          <>
                            <button
                              onClick={(e) => handleFavorite(e, vault.id)}
                              className={`p-1.5 rounded-lg hover:bg-muted transition-colors ${isFavorite(vault.id) ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500'}`}
                            >
                              <Heart className={`w-4 h-4 ${isFavorite(vault.id) ? 'fill-rose-500' : ''}`} />
                            </button>
                            <button
                              onClick={(e) => handleFork(e, vault)}
                              disabled={forkingId === vault.id}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors disabled:opacity-50"
                            >
                              <GitFork className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <div className="flex items-center text-sm text-amber-500 font-semibold group-hover:gap-2 transition-all">
                          View
                          <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-border mt-16 py-8 text-center">
        <p className="text-sm text-muted-foreground font-mono">
          Powered by <Link to="/" className="text-amber-500 hover:underline">refhub.io</Link>
        </p>
      </footer>
    </div>
  );
}