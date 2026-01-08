import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag } from '@/types/database';
import { publicationToBibtex, exportMultipleToBibtex, downloadBibtex } from '@/lib/bibtex';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useVaultFavorites } from '@/hooks/useVaultFavorites';
import { useVaultFork } from '@/hooks/useVaultFork';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  Search, 
  Download, 
  ExternalLink, 
  FileText,
  BookOpen,
  Calendar,
  Users,
  ArrowLeft,
  Globe,
  Heart,
  GitFork
} from 'lucide-react';

export default function PublicVault() {
  const { slug } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
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
  const [isOwner, setIsOwner] = useState(false);
  const [forking, setForking] = useState(false);

  useEffect(() => {
    if (slug) {
      fetchPublicVault();
    }
  }, [slug]);

  const fetchPublicVault = async () => {
    setLoading(true);
    try {
      // Fetch the vault by slug
      const { data: vaultData, error: vaultError } = await supabase
        .from('vaults')
        .select('*')
        .eq('public_slug', slug)
        .eq('is_public', true)
        .single();

      if (vaultError || !vaultData) {
        setNotFound(true);
        return;
      }

      setVault(vaultData as Vault);
      
      // Check if current user is the owner
      if (user && vaultData.user_id === user.id) {
        setIsOwner(true);
      }

      // Increment view count
      await supabase.rpc('increment_vault_views', { vault_uuid: vaultData.id });

      // Fetch publications in this vault
      const { data: pubsData } = await supabase
        .from('publications')
        .select('*')
        .eq('vault_id', vaultData.id)
        .order('year', { ascending: false });

      if (pubsData) {
        setPublications(pubsData as Publication[]);

        // Fetch tags for these publications
        const pubIds = pubsData.map(p => p.id);
        if (pubIds.length > 0) {
          const { data: pubTagsData } = await supabase
            .from('publication_tags')
            .select('*')
            .in('publication_id', pubIds);

          if (pubTagsData) {
            setPublicationTags(pubTagsData as PublicationTag[]);

            const tagIds = [...new Set(pubTagsData.map(pt => pt.tag_id))];
            if (tagIds.length > 0) {
              const { data: tagsData } = await supabase
                .from('tags')
                .select('*')
                .in('id', tagIds);

              if (tagsData) {
                setTags(tagsData as Tag[]);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching public vault:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const filteredPublications = publications.filter((pub) => {
    const query = searchQuery.toLowerCase();
    return (
      pub.title.toLowerCase().includes(query) ||
      pub.authors?.some(a => a.toLowerCase().includes(query)) ||
      pub.journal?.toLowerCase().includes(query)
    );
  });

  const publicationTagsMap: Record<string, string[]> = {};
  publicationTags.forEach((pt) => {
    if (!publicationTagsMap[pt.publication_id]) {
      publicationTagsMap[pt.publication_id] = [];
    }
    publicationTagsMap[pt.publication_id].push(pt.tag_id);
  });

  const getTagsForPublication = (pubId: string): Tag[] => {
    const tagIds = publicationTagsMap[pubId] || [];
    return tags.filter(t => tagIds.includes(t.id));
  };

  const handleExportAll = async () => {
    if (filteredPublications.length === 0 || !vault) return;
    
    // Increment download count
    await supabase.rpc('increment_vault_downloads', { vault_uuid: vault.id });
    
    const content = exportMultipleToBibtex(filteredPublications);
    downloadBibtex(content, `${vault.name || 'references'}.bib`);
    toast({ title: `Exported ${filteredPublications.length} references 📄` });
  };

  const handleExportSingle = (pub: Publication) => {
    const content = publicationToBibtex(pub);
    downloadBibtex(content, `${pub.bibtex_key || 'reference'}.bib`);
    toast({ title: 'Reference exported 📄' });
  };

  const handleFavorite = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to favorite this vault.',
        variant: 'destructive',
      });
      return;
    }
    if (!vault) return;
    
    const success = await toggleFavorite(vault.id);
    if (success) {
      toast({
        title: isFavorite(vault.id) ? 'Removed from favorites' : 'Added to favorites ❤️',
      });
    }
  };

  const handleFork = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg glow-purple animate-glow-pulse">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <p className="text-muted-foreground font-mono text-sm">// loading vault...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Globe className="w-10 h-10 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">Vault Not Found</h1>
            <p className="text-muted-foreground font-mono text-sm">
              // this vault doesn't exist or isn't public
            </p>
          </div>
          <Link to="/">
            <Button variant="glow">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

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
          <Badge variant="neon" className="gap-1">
            <Globe className="w-3 h-3" />
            Public Vault
          </Badge>
        </div>
      </header>

      {/* Vault Header */}
      <div className="border-b-2 border-border bg-gradient-to-b from-card/80 to-background">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex items-start gap-4">
            <div 
              className="w-16 h-16 rounded-2xl shrink-0 shadow-lg"
              style={{ backgroundColor: vault?.color }}
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl md:text-4xl font-bold mb-2">{vault?.name}</h1>
              {vault?.description && (
                <p className="text-muted-foreground font-mono text-sm mb-4">
                  // {vault.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  {publications.length} papers
                </span>
              </div>
            </div>
            
            {/* Fork/Favorite buttons - only show if not owner */}
            {!isOwner && (
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFavorite}
                  className={vault && isFavorite(vault.id) ? 'text-rose-500 border-rose-500/30' : ''}
                >
                  <Heart className={`w-4 h-4 mr-1.5 ${vault && isFavorite(vault.id) ? 'fill-rose-500' : ''}`} />
                  {vault && isFavorite(vault.id) ? 'Favorited' : 'Favorite'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFork}
                  disabled={forking}
                >
                  <GitFork className="w-4 h-4 mr-1.5" />
                  {forking ? 'Forking...' : 'Fork'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Search and Export */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search papers..."
              className="pl-10"
            />
          </div>
          <Button 
            variant="outline" 
            onClick={handleExportAll}
            disabled={filteredPublications.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export All BibTeX
          </Button>
        </div>

        {/* Publications Grid */}
        {filteredPublications.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground font-mono">
              {searchQuery ? '// no papers match your search' : '// no papers in this vault yet'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredPublications.map((pub) => {
              const pubTags = getTagsForPublication(pub.id);
              return (
                <article
                  key={pub.id}
                  className="p-6 rounded-2xl border-2 border-border bg-card/50 hover:border-primary/30 transition-all duration-200 group"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                        {pub.title}
                      </h2>
                      
                      {pub.authors && pub.authors.length > 0 && (
                        <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          {pub.authors.join(', ')}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
                        {pub.journal && (
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />
                            {pub.journal}
                          </span>
                        )}
                        {pub.year && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {pub.year}
                          </span>
                        )}
                        {pub.volume && <span>Vol. {pub.volume}</span>}
                        {pub.issue && <span>Issue {pub.issue}</span>}
                      </div>

                      {pubTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {pubTags.map((tag) => (
                            <Badge
                              key={tag.id}
                              variant="outline"
                              style={{
                                borderColor: tag.color,
                                color: tag.color,
                                backgroundColor: `${tag.color}15`,
                              }}
                            >
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {pub.abstract && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {pub.abstract}
                        </p>
                      )}
                    </div>

                    <div className="flex lg:flex-col gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportSingle(pub)}
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        BibTeX
                      </Button>
                      {pub.doi && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <a
                            href={`https://doi.org/${pub.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                            DOI
                          </a>
                        </Button>
                      )}
                      {pub.url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <a
                            href={pub.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                            Link
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
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
