import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag, PublicationRelation } from '@/types/database';
import { generateBibtexKey } from '@/lib/bibtex';
import { Sidebar } from '@/components/layout/Sidebar';
import { PublicationList } from '@/components/publications/PublicationList';
import { PublicationDialog } from '@/components/publications/PublicationDialog';
import { ImportDialog } from '@/components/publications/ImportDialog';
import { VaultDialog } from '@/components/vaults/VaultDialog';
import { RelationshipGraph } from '@/components/publications/RelationshipGraph';
import { ProfileDialog } from '@/components/profile/ProfileDialog';
import { ExportDialog } from '@/components/publications/ExportDialog';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/hooks/use-toast';
import { Sparkles } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [publications, setPublications] = useState<Publication[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [publicationTags, setPublicationTags] = useState<PublicationTag[]>([]);
  const [publicationRelations, setPublicationRelations] = useState<PublicationRelation[]>([]);
  const [sharedVaults, setSharedVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showLoader, setShowLoader] = useState(() => {
    // Check if loader has already been shown this session
    return !sessionStorage.getItem('loaderShown');
  });

  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [isPublicationDialogOpen, setIsPublicationDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingPublication, setEditingPublication] = useState<Publication | null>(null);

  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [editingVault, setEditingVault] = useState<Vault | null>(null);
  const [initialRequestId, setInitialRequestId] = useState<string | null>(null);
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  const [searchParams] = useSearchParams();
  const [exportPublications, setExportPublications] = useState<Publication[]>([]);

  const [deleteConfirmation, setDeleteConfirmation] = useState<Publication | null>(null);
  const [deleteVaultConfirmation, setDeleteVaultConfirmation] = useState<Vault | null>(null);

  // Ensure loader shows for at least 3 seconds on initial session load only
  useEffect(() => {
    const loaderShown = sessionStorage.getItem('loaderShown');
    if (!loaderShown) {
      setShowLoader(true);
      const timer = setTimeout(() => {
        setShowLoader(false);
        sessionStorage.setItem('loaderShown', 'true');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    if (isInitialLoad) {
      setLoading(true);
    }
    try {
      // Fetch owned vaults, shared vaults, and other data
      const [pubsRes, ownedVaultsRes, sharedVaultsRes, tagsRes, pubTagsRes, relationsRes] = await Promise.all([
        supabase.from('publications').select('*').order('created_at', { ascending: false }),
        supabase.from('vaults').select('*').eq('user_id', user.id).order('name'),
        // Fetch vaults shared with current user (via email or user_id)
        supabase
          .from('vault_shares')
          .select('vault_id')
          .or(`shared_with_email.eq."${user.email}",shared_with_user_id.eq.${user.id}`),
        supabase.from('tags').select('*').order('name'),
        supabase.from('publication_tags').select('*'),
        supabase.from('publication_relations').select('*'),
      ]);

      if (pubsRes.data) setPublications(pubsRes.data as Publication[]);
      if (ownedVaultsRes.data) setVaults(ownedVaultsRes.data as Vault[]);
      if (tagsRes.data) setTags(tagsRes.data as Tag[]);
      if (pubTagsRes.data) setPublicationTags(pubTagsRes.data as PublicationTag[]);
      if (relationsRes.data) setPublicationRelations(relationsRes.data as PublicationRelation[]);

      // Fetch shared vault details
      if (sharedVaultsRes.data && sharedVaultsRes.data.length > 0) {
        const sharedVaultIds = sharedVaultsRes.data.map(s => s.vault_id);
        const { data: sharedVaultDetails } = await supabase
          .from('vaults')
          .select('*')
          .in('id', sharedVaultIds)
          .neq('user_id', user.id); // Exclude own vaults
        
        if (sharedVaultDetails) {
          setSharedVaults(sharedVaultDetails as Vault[]);
        }
      } else {
        setSharedVaults([]);
      }
    } catch (error) {
      toast({
        title: 'error_loading_data',
        description: 'Please try refreshing the page.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isInitialLoad]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, fetchData]);

  // Open vault settings if URL contains openVault param (e.g., from a notification)
  useEffect(() => {
    const openVaultId = searchParams.get('openVault');
    const requestId = searchParams.get('request');
    if (openVaultId && vaults.length > 0) {
      const found = vaults.find((v) => v.id === openVaultId);
      if (found) {
        setEditingVault(found);
        setInitialRequestId(requestId);
        setIsVaultDialogOpen(true);
        // Clean up URL to remove params
        navigate('/dashboard', { replace: true });
      }
    }
  }, [searchParams, vaults, navigate]);

  const refetchVaults = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('vaults')
        .select('*')
        .eq('user_id', user.id)
        .order('name');
      
      if (error) throw error;
      if (data) setVaults(data as Vault[]);
    } catch (error) {
      console.error('Error refetching vaults:', error);
    }
  };

  const refetchRelations = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('publication_relations')
        .select('*');
      
      if (error) throw error;
      if (data) setPublicationRelations(data as PublicationRelation[]);
    } catch (error) {
      console.error('Error refetching publication relations:', error);
    }
  };

  const filteredPublications = selectedVaultId
    ? publications.filter((p) => p.vault_id === selectedVaultId)
    : publications;

  const selectedVault = selectedVaultId
    ? vaults.find((v) => v.id === selectedVaultId) || null
    : null;

  const publicationTagsMap: Record<string, string[]> = {};
  publicationTags.forEach((pt) => {
    if (!publicationTagsMap[pt.publication_id]) {
      publicationTagsMap[pt.publication_id] = [];
    }
    publicationTagsMap[pt.publication_id].push(pt.tag_id);
  });

  // Build relations count map (bidirectional)
  const relationsCountMap: Record<string, number> = {};
  publicationRelations.forEach((rel) => {
    relationsCountMap[rel.publication_id] = (relationsCountMap[rel.publication_id] || 0) + 1;
    relationsCountMap[rel.related_publication_id] = (relationsCountMap[rel.related_publication_id] || 0) + 1;
  });

  const checkForDuplicate = (newPub: Partial<Publication>, existingPubs: Publication[], excludeId?: string) => {
    const duplicate = existingPubs.find(pub => {
      if (excludeId && pub.id === excludeId) return false;
      
      // Check DOI match (if DOI exists on both)
      if (newPub.doi && pub.doi && newPub.doi.toLowerCase().trim() === pub.doi.toLowerCase().trim()) {
        return true;
      }
      
      // Check title match (normalize for comparison)
      if (newPub.title && pub.title) {
        const normalizeTitle = (title: string) => title.toLowerCase().trim().replace(/\s+/g, ' ');
        if (normalizeTitle(newPub.title) === normalizeTitle(pub.title)) {
          return true;
        }
      }
      
      return false;
    });
    
    return duplicate;
  };

  const handleSavePublication = async (data: Partial<Publication>, tagIds: string[], isAutoSave = false) => {
    if (!user) return;

    try {
      if (editingPublication) {
        // Auto-generate bibkey if empty
        const dataToSave = {
          ...data,
          bibtex_key: data.bibtex_key || generateBibtexKey({ ...editingPublication, ...data } as Publication)
        };
        
        const { data: updatedPub, error } = await supabase
          .from('publications')
          .update(dataToSave)
          .eq('id', editingPublication.id)
          .select()
          .single();

        if (error) throw error;

        // Update tags
        await supabase.from('publication_tags').delete().eq('publication_id', editingPublication.id);
        if (tagIds.length > 0) {
          await supabase.from('publication_tags').insert(
            tagIds.map((tagId) => ({
              publication_id: editingPublication.id,
              tag_id: tagId,
            }))
          );
        }

        // Optimistic update
        setPublications(prev => prev.map(p => 
          p.id === editingPublication.id ? { ...p, ...updatedPub } as Publication : p
        ));
        setPublicationTags(prev => [
          ...prev.filter(pt => pt.publication_id !== editingPublication.id),
          ...tagIds.map(tagId => ({ id: crypto.randomUUID(), publication_id: editingPublication.id, tag_id: tagId }))
        ]);

        // Update editingPublication with new data so dialog stays in sync
        if (isAutoSave) {
          setEditingPublication({ ...editingPublication, ...updatedPub } as Publication);
        }

        if (!isAutoSave) {
          toast({ title: 'paper_updated ✨' });
        }
      } else {
        // Check for duplicates before adding
        const duplicate = checkForDuplicate(data, publications);
        if (duplicate) {
          toast({
            title: 'duplicate_detected',
            description: `Paper already exists: "${duplicate.title.substring(0, 50)}..."`,
            variant: 'destructive',
          });
          return;
        }

        // Auto-generate bibkey if empty
        const dataToSave = {
          ...data,
          user_id: user.id,
          bibtex_key: data.bibtex_key || generateBibtexKey(data as Publication)
        };
        
        const { data: newPub, error } = await supabase
          .from('publications')
          .insert([dataToSave as Omit<Publication, 'id' | 'created_at' | 'updated_at'>])
          .select()
          .single();

        if (error) throw error;

        if (tagIds.length > 0 && newPub) {
          await supabase.from('publication_tags').insert(
            tagIds.map((tagId) => ({
              publication_id: newPub.id,
              tag_id: tagId,
            }))
          );
        }

        // Optimistic update
        setPublications(prev => [newPub as Publication, ...prev]);
        if (tagIds.length > 0 && newPub) {
          setPublicationTags(prev => [
            ...prev,
            ...tagIds.map(tagId => ({ id: crypto.randomUUID(), publication_id: newPub.id, tag_id: tagId }))
          ]);
        }

        toast({ title: 'paper_added ✨' });
      }

      // Only clear editing publication on manual save, not auto-save
      if (!isAutoSave) {
        setEditingPublication(null);
      }
    } catch (error) {
      toast({
        title: 'error_saving_paper',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleBulkImport = async (publicationsToImport: Partial<Publication>[]) => {
    if (!user) return;

    const pubsToInsert = publicationsToImport.map(pub => ({
      ...pub,
      user_id: user.id,
      authors: pub.authors || [],
    }));

    if (pubsToInsert.length === 0) {
      toast({
        title: 'no_papers_to_import',
        description: 'All papers were duplicates',
        variant: 'destructive',
      });
      return;
    }

    const { data: insertedPubs, error } = await supabase
      .from('publications')
      .insert(pubsToInsert as Omit<Publication, 'id' | 'created_at' | 'updated_at'>[])
      .select();

    if (error) throw error;

    // Optimistic update
    if (insertedPubs) {
      setPublications(prev => [...(insertedPubs as Publication[]), ...prev]);
    }
  };

  const handleAddToVaults = async (publicationId: string, vaultIds: string[]) => {
    if (!user) return;

    try {
      const publication = publications.find(p => p.id === publicationId);
      if (!publication) throw new Error('Publication not found');

      // For each vault, either update or duplicate the publication
      for (const vaultId of vaultIds) {
        // If this is the original publication's vault, skip
        if (publication.vault_id === vaultId) continue;

        // Create a copy of the publication in the new vault - include all fields
        const { 
          title, authors, year, journal, volume, issue, pages, doi, url, abstract, pdf_url, bibtex_key, publication_type, notes,
          booktitle, chapter, edition, editor, howpublished, institution, number, organization, publisher, school, series, type,
          eid, isbn, issn, keywords
        } = publication;
        const { data: newPub, error } = await supabase
          .from('publications')
          .insert({
            title, authors, year, journal, volume, issue, pages, doi, url, abstract, pdf_url, bibtex_key, publication_type, notes,
            booktitle, chapter, edition, editor, howpublished, institution, number, organization, publisher, school, series, type,
            eid, isbn, issn, keywords,
            user_id: user.id,
            vault_id: vaultId,
          })
          .select()
          .single();

        if (error) throw error;

        // Optimistic update
        if (newPub) {
          setPublications(prev => [newPub as Publication, ...prev]);
        }
      }

      toast({ title: `added_to_${vaultIds.length}_vault${vaultIds.length > 1 ? 's' : ''} ✨` });
    } catch (error) {
      toast({
        title: 'Error adding paper',
        description: (error as Error).message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDeletePublication = async () => {
    if (!deleteConfirmation) return;

    const deletedId = deleteConfirmation.id;

    try {
      // Optimistic update
      setPublications(prev => prev.filter(p => p.id !== deletedId));
      setPublicationTags(prev => prev.filter(pt => pt.publication_id !== deletedId));

      const { error } = await supabase
        .from('publications')
        .delete()
        .eq('id', deletedId);

      if (error) throw error;

      toast({ title: 'paper_deleted' });
    } catch (error) {
      // Revert on error
      fetchData();
      toast({
        title: 'error_deleting_paper',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setDeleteConfirmation(null);
    }
  };

  const handleDeleteVault = async () => {
    if (!deleteVaultConfirmation) return;

    const deletedId = deleteVaultConfirmation.id;

    try {
      // Check if vault has publications
      const { data: pubs } = await supabase
        .from('publications')
        .select('id')
        .eq('vault_id', deletedId);

      if (pubs && pubs.length > 0) {
        toast({
          title: 'cannot_delete_vault',
          description: `This vault contains ${pubs.length} paper${pubs.length > 1 ? 's' : ''}. Remove them first.`,
          variant: 'destructive',
        });
        setDeleteVaultConfirmation(null);
        return;
      }

      // Check if vault has been forked
      const { data: forks } = await supabase
        .from('vault_forks')
        .select('id')
        .eq('original_vault_id', deletedId);

      if (forks && forks.length > 0) {
        toast({
          title: 'cannot_delete_vault',
          description: `This vault has ${forks.length} fork${forks.length > 1 ? 's' : ''}. Public vaults with forks cannot be deleted.`,
          variant: 'destructive',
        });
        setDeleteVaultConfirmation(null);
        return;
      }

      // Delete vault shares first
      await supabase
        .from('vault_shares')
        .delete()
        .eq('vault_id', deletedId);

      // Delete vault favorites first
      await supabase
        .from('vault_favorites')
        .delete()
        .eq('vault_id', deletedId);

      // Optimistic update
      setVaults(prev => prev.filter(v => v.id !== deletedId));
      if (selectedVaultId === deletedId) {
        setSelectedVaultId(null);
      }

      const { error } = await supabase
        .from('vaults')
        .delete()
        .eq('id', deletedId);

      if (error) throw error;

      toast({ title: 'vault_deleted' });
      setIsVaultDialogOpen(false);
    } catch (error) {
      // Revert on error
      fetchData();
      toast({
        title: 'error_deleting_vault',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setDeleteVaultConfirmation(null);
    }
  };

  const handleCreateTag = async (name: string, parentId?: string): Promise<Tag | null> => {
    if (!user) return null;

    try {
      const colors = ['#a855f7', '#ec4899', '#f43f5e', '#22c55e', '#06b6d4', '#3b82f6', '#f97316'];
      
      // If parent exists, inherit parent's color for hue consistency
      let color = colors[Math.floor(Math.random() * colors.length)];
      if (parentId) {
        const parentTag = tags.find(t => t.id === parentId);
        if (parentTag) {
          color = parentTag.color;
        }
      }

      const { data, error } = await supabase
        .from('tags')
        .insert({ name, color, user_id: user.id, parent_id: parentId || null })
        .select()
        .single();

      if (error) throw error;

      setTags(prev => [...prev, data as Tag]);
      return data as Tag;
    } catch (error) {
      toast({
        title: 'error_creating_tag',
        description: (error as Error).message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleSaveVault = async (data: Partial<Vault>) => {
    if (!user) return;

    try {
      if (editingVault) {
        const { data: updatedVault, error } = await supabase
          .from('vaults')
          .update(data)
          .eq('id', editingVault.id)
          .select()
          .single();

        if (error) throw error;
        
        // Optimistic update
        setVaults(prev => prev.map(v => 
          v.id === editingVault.id ? { ...v, ...updatedVault } as Vault : v
        ));
        
        toast({ title: 'vault_updated ✨' });
      } else {
        const { data: newVault, error } = await supabase
          .from('vaults')
          .insert([{ ...data, user_id: user.id } as Omit<Vault, 'id' | 'created_at' | 'updated_at'>])
          .select()
          .single();

        if (error) throw error;
        
        // Optimistic update
        if (newVault) {
          setVaults(prev => [...prev, newVault as Vault].sort((a, b) => a.name.localeCompare(b.name)));
        }
        
        toast({ title: 'vault_created ✨' });
      }

      setEditingVault(null);
    } catch (error) {
      toast({
        title: 'error_adding_to_vaults',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleExportBibtex = (pubs: Publication[]) => {
    if (pubs.length === 0) return;
    setExportPublications(pubs);
    setIsExportDialogOpen(true);
  };

  // Only show full loading screen on auth loading, not on data loading
  // Show loader for minimum 3 seconds on first load
  if (authLoading || showLoader) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="loading_your_library" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        vaults={vaults}
        sharedVaults={sharedVaults}
        selectedVaultId={selectedVaultId}
        onSelectVault={setSelectedVaultId}
        onCreateVault={() => {
          setEditingVault(null);
          setIsVaultDialogOpen(true);
        }}
        onEditVault={(vault) => {
          setEditingVault(vault);
          setIsVaultDialogOpen(true);
        }}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
        profile={profile}
        onEditProfile={() => setIsProfileDialogOpen(true)}
      />

      <div className="flex-1 lg:pl-72 min-w-0">
        <PublicationList
        publications={filteredPublications}
        tags={tags}
        vaults={vaults}
        publicationTagsMap={publicationTagsMap}
        relationsCountMap={relationsCountMap}
        selectedVault={selectedVault}
        onAddPublication={() => {
          setEditingPublication(null);
          setIsPublicationDialogOpen(true);
        }}
        onImportPublications={() => setIsImportDialogOpen(true)}
        onEditPublication={(pub) => {
          setEditingPublication(pub);
          setIsPublicationDialogOpen(true);
        }}
        onDeletePublication={(pub) => setDeleteConfirmation(pub)}
        onExportBibtex={handleExportBibtex}
        onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
        onOpenGraph={() => setIsGraphOpen(true)}
        onEditVault={(vault) => {
          setEditingVault(vault);
          setIsVaultDialogOpen(true);
        }}
        onVaultUpdate={refetchVaults}
      />
      </div>

      <PublicationDialog
        open={isPublicationDialogOpen}
        onOpenChange={(open) => {
          setIsPublicationDialogOpen(open);
          if (!open) {
            setEditingPublication(null);
            refetchRelations();
          }
        }}
        publication={editingPublication}
        vaults={vaults}
        tags={tags}
        publicationTags={editingPublication ? publicationTagsMap[editingPublication.id] || [] : []}
        allPublications={publications}
        onSave={handleSavePublication}
        onCreateTag={handleCreateTag}
      />

      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        vaults={vaults}
        allPublications={publications}
        currentVaultId={selectedVaultId}
        onImport={handleBulkImport}
        onAddToVaults={handleAddToVaults}
      />

      <VaultDialog
        open={isVaultDialogOpen}
        onOpenChange={(open) => {
          setIsVaultDialogOpen(open);
          if (!open) setInitialRequestId(null);
        }}
        vault={editingVault}
        initialRequestId={initialRequestId || undefined}
        onSave={handleSaveVault}
        onUpdate={fetchData}
        onDelete={(vault) => {
          setDeleteVaultConfirmation(vault);
          setIsVaultDialogOpen(false);
        }}
      />

      <ProfileDialog
        open={isProfileDialogOpen}
        onOpenChange={(open) => {
          setIsProfileDialogOpen(open);
          if (!open) refetchProfile();
        }}
      />

      <RelationshipGraph
        open={isGraphOpen}
        onOpenChange={setIsGraphOpen}
        publications={publications}
        relations={publicationRelations}
        onSelectPublication={(pub) => {
          setEditingPublication(pub);
          setIsPublicationDialogOpen(true);
        }}
      />

      <ExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        publications={exportPublications}
        vaultName={selectedVault?.name}
      />

      <AlertDialog open={!!deleteConfirmation} onOpenChange={() => setDeleteConfirmation(null)}>
        <AlertDialogContent className="border-2 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold font-mono">delete_paper?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-sm">
              // this_will_permanently_delete "{deleteConfirmation?.title}"
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePublication} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono">
              delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteVaultConfirmation} onOpenChange={() => setDeleteVaultConfirmation(null)}>
        <AlertDialogContent className="border-2 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold font-mono">delete_vault?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-sm">
              // this_will_permanently_delete "{deleteVaultConfirmation?.name}"
              <br />
              // make_sure_the_vault_is_empty_first
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVault} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono">
              delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
