import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Vault } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  Search, 
  Globe, 
  FolderOpen,
  ArrowRight,
  BookOpen
} from 'lucide-react';

interface PublicVaultWithCount extends Vault {
  publication_count?: number;
}

export default function Explore() {
  const [vaults, setVaults] = useState<PublicVaultWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchPublicVaults();
  }, []);

  const fetchPublicVaults = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vaults')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (data && !error) {
        // Fetch publication counts for each vault
        const vaultsWithCounts = await Promise.all(
          data.map(async (vault) => {
            const { count } = await supabase
              .from('publications')
              .select('*', { count: 'exact', head: true })
              .eq('vault_id', vault.id);

            return {
              ...vault,
              publication_count: count || 0,
            } as PublicVaultWithCount;
          })
        );

        setVaults(vaultsWithCounts);
      }
    } catch (error) {
      console.error('Error fetching public vaults:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredVaults = vaults.filter((vault) => {
    const query = searchQuery.toLowerCase();
    return (
      vault.name.toLowerCase().includes(query) ||
      vault.description?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-2 border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">
              <span className="text-gradient">refhub</span>
              <span className="text-foreground/60">.io</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/codex">
              <Button variant="ghost" size="sm" className="text-amber-500 hover:text-amber-400">
                The Codex
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="outline" size="sm">
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="border-b-2 border-border bg-gradient-to-b from-primary/5 to-background">
        <div className="max-w-6xl mx-auto px-4 py-16 text-center">
          <Badge variant="neon" className="mb-4">
            <Globe className="w-3 h-3 mr-1" />
            Public Collections
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Explore <span className="text-gradient">Research Vaults</span>
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto font-mono text-sm">
            // discover curated collections of papers shared by the community
          </p>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Search */}
        <div className="mb-8">
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vaults..."
              className="pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg animate-glow-pulse">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <p className="text-muted-foreground font-mono text-sm">// loading vaults...</p>
            </div>
          </div>
        ) : filteredVaults.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground font-mono">
              {searchQuery ? '// no vaults match your search' : '// no public vaults yet'}
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVaults.map((vault) => (
              <Link
                key={vault.id}
                to={`/public/${vault.public_slug}`}
                className="group"
              >
                <article className="h-full p-6 rounded-2xl border-2 border-border bg-card/50 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300">
                  <div className="flex items-start gap-4 mb-4">
                    <div 
                      className="w-12 h-12 rounded-xl shrink-0 shadow-lg group-hover:scale-105 transition-transform"
                      style={{ backgroundColor: vault.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors truncate">
                        {vault.name}
                      </h2>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <BookOpen className="w-3 h-3" />
                        {vault.publication_count} papers
                      </div>
                    </div>
                  </div>

                  {vault.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2 font-mono">
                      // {vault.description}
                    </p>
                  )}

                  <div className="flex items-center text-sm text-primary font-semibold group-hover:gap-2 transition-all">
                    View Collection
                    <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-border mt-16 py-8 text-center">
        <p className="text-sm text-muted-foreground font-mono">
          Powered by <Link to="/" className="text-primary hover:underline">refhub.io</Link>
        </p>
      </footer>
    </div>
  );
}
