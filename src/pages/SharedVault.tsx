import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
  GitFork,
  Lock,
  StickyNote
} from 'lucide-react';

export default function SharedVault() {
  const { id } = useParams();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
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
  const [accessDenied, setAccessDenied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [forking, setForking] = useState(false);

  useEffect(() => {
    // Wait for auth to load before fetching vault
    if (id && !authLoading) {
      fetchVault();
    }
  }, [id, user, authLoading]);

  const fetchVault = async () => {
    setLoading(true);
    setNotFound(false);
    setAccessDenied(false);
    
    try {
      // Fetch the vault by ID
      const { data: vaultData, error: vaultError } = await supabase
        .from('vaults')
        .select('*')
        .eq('id', id)
        .single();

      if (vaultError || !vaultData) {
        setNotFound(true);
        return;
      }

      // Check access permissions
      const isOwnerUser = user && vaultData.user_id === user.id;
      const isPublicVault = vaultData.is_public;
      
      // Check if user has share access
      let hasShareAccess = false;
      if (user && !isOwnerUser) {
        const { data: shareData } = await supabase
          .from('vault_shares')
          .select('id')
          .eq('vault_id', id)
          .eq('shared_with_user_id', user.id)
          .single();
        
        hasShareAccess = !!shareData;
      }

      // If not owner, not public, and no share access, deny access
      if (!isOwnerUser && !isPublicVault && !hasShareAccess) {
        setAccessDenied(true);
        return;
      }

      setVault(vaultData as Vault);
      setIsOwner(!!isOwnerUser);

      // Increment view count if public
      if (isPublicVault) {
        await supabase.rpc('increment_vault_views', { vault_uuid: vaultData.id });
      }

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
      console.error('Error fetching vault:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleFork = async () => {
    if (!vault) return;
    
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to fork this vault',
        variant: 'destructive',
      });
      navigate('/auth');
      return;
    }

    setForking(true);
    try {
      const newVault = await forkVault(vault);
      if (newVault) {
        toast({
          title: 'Vault forked successfully',
          description: 'The vault has been added to your collection',
        });
        navigate('/');
      }
    } finally {
      setForking(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!vault || !user) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to favorite vaults',
        variant: 'destructive',
      });
      navigate('/auth');
      return;
    }

    await toggleFavorite(vault.id);
  };

  const exportAllBibtex = () => {
    if (publications.length === 0) return;
    
    const bibtex = exportMultipleToBibtex(publications);
    downloadBibtex(bibtex, `${vault?.name || 'vault'}-bibliography.bib`);
    
    toast({
      title: 'Bibliography exported',
      description: `Exported ${publications.length} publications`,
    });
  };

  const getPublicationTags = (publicationId: string) => {
    const pubTagIds = publicationTags
      .filter(pt => pt.publication_id === publicationId)
      .map(pt => pt.tag_id);
    return tags.filter(t => pubTagIds.includes(t.id));
  };

  const filteredPublications = publications.filter(pub => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      pub.title.toLowerCase().includes(query) ||
      pub.authors.some(author => author.toLowerCase().includes(query)) ||
      (pub.journal && pub.journal.toLowerCase().includes(query)) ||
      (pub.abstract && pub.abstract.toLowerCase().includes(query))
    );
  });

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
            <BookOpen className="w-10 h-10 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2 font-mono">vault_not_found</h1>
            <p className="text-muted-foreground font-mono text-sm">
              // this_vault_doesnt_exist_or_was_removed
            </p>
          </div>
          <Button onClick={() => navigate('/')} variant="glow" className="font-mono gap-2">
            <ArrowLeft className="w-4 h-4" />
            back_to_home
          </Button>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Lock className="w-10 h-10 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2 font-mono">access_denied</h1>
            <p className="text-muted-foreground font-mono text-sm">
              // this_vault_is_private_you_need_permission
            </p>
          </div>
          {!user && (
            <Button onClick={() => navigate('/auth')} variant="glow" className="font-mono gap-2">
              sign_in_to_view
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate('/')} className="font-mono gap-2">
            <ArrowLeft className="w-4 h-4" />
            back_to_home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-2 border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <button 
            onClick={() => navigate('/')} 
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">
              <span className="text-gradient">refhub</span>
              <span className="text-foreground/60">.io</span>
            </span>
          </button>
          <Badge variant={vault?.is_public ? "neon" : "secondary"} className="gap-1 font-mono">
            {vault?.is_public ? (
              <>
                <Globe className="w-3 h-3" />
                public_vault
              </>
            ) : (
              <>
                <Lock className="w-3 h-3" />
                shared_vault
              </>
            )}
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
            
            {/* Fork/Favorite buttons */}
            <div className="flex gap-2 shrink-0 w-full sm:w-auto">
              {user && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleFavorite}
                    disabled={isOwner}
                    className={`font-mono ${vault && isFavorite(vault.id) ? 'text-rose-500 border-rose-500/30' : ''}`}
                    title={isOwner ? 'you_own_this_vault' : undefined}
                  >
                    <Heart 
                      className={`w-4 h-4 sm:mr-1.5 ${vault && isFavorite(vault.id) ? 'fill-rose-500' : ''}`}
                    />
                    <span className="hidden sm:inline">{vault && isFavorite(vault.id) ? 'favorited' : 'favorite'}</span>
                  </Button>
                  {!isOwner && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFork}
                      disabled={forking}
                      className="font-mono"
                    >
                      <GitFork className="w-4 h-4 sm:mr-1.5" />
                      <span className="hidden sm:inline">{forking ? 'forking...' : 'fork'}</span>
                    </Button>
                  )}
                </>
              )}
              {!user && (
                <Button
                  onClick={() => navigate('/auth')}
                  variant="glow"
                  size="sm"
                  className="font-mono"
                >
                  <span className="hidden xs:inline">sign_in_to_interact</span>
                  <span className="xs:hidden">sign_in</span>
                </Button>
              )}
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
            onClick={exportAllBibtex}
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
              const pubTags = getPublicationTags(pub.id);
              const MAX_AUTHORS_DISPLAY = 3;
              const displayAuthors = pub.authors && pub.authors.length > MAX_AUTHORS_DISPLAY
                ? pub.authors.slice(0, MAX_AUTHORS_DISPLAY)
                : pub.authors || [];
              const remainingAuthors = pub.authors && pub.authors.length > MAX_AUTHORS_DISPLAY
                ? pub.authors.length - MAX_AUTHORS_DISPLAY
                : 0;

              return (
                <Accordion type="single" collapsible key={pub.id} className="w-full">
                  <AccordionItem value={pub.id} className="border-2 border-border rounded-2xl bg-card/50 hover:border-primary/30 transition-all duration-200 px-6">
                    <AccordionTrigger className="hover:no-underline py-6">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="flex-1 min-w-0 text-left space-y-3">
                        {/* Title */}
                        <h2 className="text-xl font-bold group-hover:text-primary transition-colors leading-tight">
                          {pub.title}
                        </h2>
                        
                        {/* Authors */}
                        {displayAuthors.length > 0 && (
                          <div className="flex items-start gap-2">
                            <Users className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              <span className="font-medium">{displayAuthors.join(', ')}</span>
                              {remainingAuthors > 0 && (
                                <span className="text-muted-foreground/70 italic">
                                  {' '}and {remainingAuthors} more
                                </span>
                              )}
                            </p>
                          </div>
                        )}

                        {/* Publication Details */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                          {pub.journal && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <BookOpen className="w-3.5 h-3.5 shrink-0" />
                              <span className="italic">{pub.journal}</span>
                            </div>
                          )}
                          {pub.year && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono">{pub.year}</span>
                            </div>
                          )}
                          {pub.volume && (
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">
                              Vol. {pub.volume}
                            </span>
                          )}
                          {pub.issue && (
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">
                              Issue {pub.issue}
                            </span>
                          )}
                          {pub.notes && (
                            <div className="flex items-center gap-1 text-neon-orange">
                              <StickyNote className="w-3.5 h-3.5" />
                              <span className="text-xs font-mono">has_notes</span>
                            </div>
                          )}
                        </div>

                        {/* Tags */}
                        {pubTags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {pubTags.map((tag) => (
                              <HierarchicalTagBadge
                                key={tag.id}
                                tag={tag}
                                allTags={tags}
                                size="sm"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Quick DOI icon (visible when collapsed, hidden when expanded) */}
                      {pub.doi && (
                        <div className="shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-8 w-8 p-0"
                          >
                            <a
                              href={`https://doi.org/${encodeURIComponent(pub.doi)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View DOI"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </Button>
                        </div>
                      )}
                    </div>
                    </AccordionTrigger>
                    
                    <AccordionContent className="pb-6 pt-2 space-y-4">
                      {/* Abstract */}
                      {pub.abstract && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-mono text-muted-foreground">// abstract</span>
                          </div>
                          <p className="text-sm text-muted-foreground/80 leading-relaxed pl-6">
                            {pub.abstract}
                          </p>
                        </div>
                      )}

                      {/* Notes */}
                      {pub.notes && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <StickyNote className="w-3.5 h-3.5 text-neon-orange" />
                            <span className="text-xs font-mono text-muted-foreground">// notes</span>
                          </div>
                          <div className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-lg bg-muted/30 border border-border/50 ml-6">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {pub.notes}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}

                      {/* Publication Metadata */}
                      {(pub.doi || pub.url || pub.pdf_url || pub.pages) && (
                        <div className="space-y-2">
                          <span className="text-xs font-mono text-muted-foreground">// additional_info</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                            {pub.pages && (
                              <div className="text-sm text-muted-foreground">
                                <span className="font-mono text-xs text-muted-foreground/70">pages:</span> {pub.pages}
                              </div>
                            )}
                            {pub.doi && (
                              <div className="text-sm">
                                <span className="font-mono text-xs text-muted-foreground/70">doi:</span>{' '}
                                <a
                                  href={`https://doi.org/${encodeURIComponent(pub.doi)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline font-mono text-xs"
                                >
                                  {pub.doi}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            const bibtex = publicationToBibtex(pub);
                            downloadBibtex(bibtex, `${pub.bibtex_key || 'publication'}.bib`);
                            toast({ title: 'BibTeX downloaded' });
                          }}
                          className="font-mono"
                        >
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          download_bibtex
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
                              className="font-mono"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                              view_doi
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
                              className="font-mono"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                              view_link
                            </a>
                          </Button>
                        )}
                        {pub.pdf_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a
                              href={pub.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FileText className="w-3.5 h-3.5 mr-1.5" />
                              view_pdf
                            </a>
                          </Button>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-border mt-16 py-8 text-center">
        <p className="text-sm text-muted-foreground font-mono">
          Powered by <button onClick={() => navigate('/')} className="text-primary hover:underline">refhub.io</button>
        </p>
      </footer>
    </div>
  );
}
