import { useState, useEffect, useCallback } from 'react';
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
import { HierarchicalTagBadge } from '@/components/tags/HierarchicalTagBadge';
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

  const fetchPublicVault = useCallback(async () => {
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
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug, user]);

  useEffect(() => {
    if (slug) {
      fetchPublicVault();
    }
  }, [slug, fetchPublicVault]);

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
    toast({ title: `exported_${filteredPublications.length}_references 📄` });
  };

  const handleExportSingle = (pub: Publication) => {
    const content = publicationToBibtex(pub);
    downloadBibtex(content, `${pub.bibtex_key || 'reference'}.bib`);
    toast({ title: 'reference_exported 📄' });
  };

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
            <h1 className="text-2xl font-bold mb-2 font-mono">vault_not_found</h1>
            <p className="text-muted-foreground font-mono text-sm">
              // this_vault_doesnt_exist_or_isnt_public
            </p>
          </div>
          <Link to="/">
            <Button variant="glow" className="font-mono">
              <ArrowLeft className="w-4 h-4 mr-2" />
              back_to_home
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
          <Badge variant="neon" className="gap-1 font-mono">
            <Globe className="w-3 h-3" />
            public_vault
          </Badge>
        </div>
      </header>

      {/* Vault Header */}
      <div className="border-b-2 border-border bg-gradient-to-b from-card/80 to-background">
        <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div 
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl shrink-0 shadow-lg"
              style={{ backgroundColor: vault?.color }}
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">{vault?.name}</h1>
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
            
            {/* Fork/Favorite buttons - visible to all users */}
            <div className="flex gap-2 shrink-0 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFavorite}
                disabled={isOwner}
                className={`font-mono ${vault && isFavorite(vault.id) ? 'text-rose-500 border-rose-500/30' : ''}`}
                title={isOwner ? 'you_own_this_vault' : undefined}
              >
                <Heart className={`w-4 h-4 sm:mr-1.5 ${vault && isFavorite(vault.id) ? 'fill-rose-500' : ''}`} />
                <span className="hidden sm:inline">{vault && isFavorite(vault.id) ? 'favorited' : 'favorite'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFork}
                disabled={forking || isOwner}
                title={isOwner ? 'you_own_this_vault' : undefined}
                className="font-mono"
              >
                <GitFork className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">{forking ? 'forking...' : 'fork'}</span>
              </Button>
            </div>
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
              placeholder="search_papers..."
              className="pl-10 font-mono"
            />
          </div>
          <Button 
            variant="outline" 
            onClick={handleExportAll}
            disabled={filteredPublications.length === 0}
            className="font-mono"
          >
            <Download className="w-4 h-4 mr-2" />
            export_all_bibtex
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
                            <HierarchicalTagBadge
                              key={tag.id}
                              tag={tag}
                              allTags={tags}
                              size="sm"
                              showHierarchy
                            />
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
                            href={`https://doi.org/${encodeURIComponent(pub.doi)}`}
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
