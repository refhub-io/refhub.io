import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag } from '@/types/database';
import { Sidebar } from '@/components/layout/Sidebar';
import { PublicationList } from '@/components/publications/PublicationList';
import { PublicationDialog } from '@/components/publications/PublicationDialog';
import { VaultDialog } from '@/components/vaults/VaultDialog';
import { publicationToBibtex, exportMultipleToBibtex, downloadBibtex } from '@/lib/bibtex';
import { useToast } from '@/hooks/use-toast';
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
  const navigate = useNavigate();
  const { toast } = useToast();

  const [publications, setPublications] = useState<Publication[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [publicationTags, setPublicationTags] = useState<PublicationTag[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [isPublicationDialogOpen, setIsPublicationDialogOpen] = useState(false);
  const [editingPublication, setEditingPublication] = useState<Publication | null>(null);

  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [editingVault, setEditingVault] = useState<Vault | null>(null);

  const [deleteConfirmation, setDeleteConfirmation] = useState<Publication | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pubsRes, vaultsRes, tagsRes, pubTagsRes] = await Promise.all([
        supabase.from('publications').select('*').order('created_at', { ascending: false }),
        supabase.from('vaults').select('*').order('name'),
        supabase.from('tags').select('*').order('name'),
        supabase.from('publication_tags').select('*'),
      ]);

      if (pubsRes.data) setPublications(pubsRes.data as Publication[]);
      if (vaultsRes.data) setVaults(vaultsRes.data as Vault[]);
      if (tagsRes.data) setTags(tagsRes.data as Tag[]);
      if (pubTagsRes.data) setPublicationTags(pubTagsRes.data as PublicationTag[]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error loading data',
        description: 'Please try refreshing the page.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
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

  const handleSavePublication = async (data: Partial<Publication>, tagIds: string[]) => {
    if (!user) return;

    try {
      if (editingPublication) {
        const { error } = await supabase
          .from('publications')
          .update(data)
          .eq('id', editingPublication.id);

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

        toast({ title: 'Publication updated' });
      } else {
        const { data: newPub, error } = await supabase
          .from('publications')
          .insert([{ ...data, user_id: user.id } as any])
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

        toast({ title: 'Publication added' });
      }

      fetchData();
      setEditingPublication(null);
    } catch (error: any) {
      console.error('Error saving publication:', error);
      toast({
        title: 'Error saving publication',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeletePublication = async () => {
    if (!deleteConfirmation) return;

    try {
      const { error } = await supabase
        .from('publications')
        .delete()
        .eq('id', deleteConfirmation.id);

      if (error) throw error;

      toast({ title: 'Publication deleted' });
      fetchData();
    } catch (error: any) {
      console.error('Error deleting publication:', error);
      toast({
        title: 'Error deleting publication',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setDeleteConfirmation(null);
    }
  };

  const handleCreateTag = async (name: string): Promise<Tag | null> => {
    if (!user) return null;

    try {
      const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#22c55e', '#06b6d4'];
      const color = colors[Math.floor(Math.random() * colors.length)];

      const { data, error } = await supabase
        .from('tags')
        .insert({ name, color, user_id: user.id })
        .select()
        .single();

      if (error) throw error;

      setTags([...tags, data as Tag]);
      return data as Tag;
    } catch (error: any) {
      console.error('Error creating tag:', error);
      toast({
        title: 'Error creating tag',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleSaveVault = async (data: Partial<Vault>) => {
    if (!user) return;

    try {
      if (editingVault) {
        const { error } = await supabase
          .from('vaults')
          .update(data)
          .eq('id', editingVault.id);

        if (error) throw error;
        toast({ title: 'Vault updated' });
      } else {
        const { error } = await supabase
          .from('vaults')
          .insert([{ ...data, user_id: user.id } as any]);

        if (error) throw error;
        toast({ title: 'Vault created' });
      }

      fetchData();
      setEditingVault(null);
    } catch (error: any) {
      console.error('Error saving vault:', error);
      toast({
        title: 'Error saving vault',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleExportBibtex = (pubs: Publication[]) => {
    if (pubs.length === 0) return;

    const filename = pubs.length === 1
      ? `${pubs[0].bibtex_key || 'reference'}.bib`
      : 'references.bib';

    const content = pubs.length === 1
      ? publicationToBibtex(pubs[0])
      : exportMultipleToBibtex(pubs);

    downloadBibtex(content, filename);
    toast({ title: `Exported ${pubs.length} reference${pubs.length > 1 ? 's' : ''}` });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading your library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        vaults={vaults}
        selectedVaultId={selectedVaultId}
        onSelectVault={setSelectedVaultId}
        onCreateVault={() => {
          setEditingVault(null);
          setIsVaultDialogOpen(true);
        }}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      <PublicationList
        publications={filteredPublications}
        tags={tags}
        vaults={vaults}
        publicationTagsMap={publicationTagsMap}
        selectedVault={selectedVault}
        onAddPublication={() => {
          setEditingPublication(null);
          setIsPublicationDialogOpen(true);
        }}
        onEditPublication={(pub) => {
          setEditingPublication(pub);
          setIsPublicationDialogOpen(true);
        }}
        onDeletePublication={(pub) => setDeleteConfirmation(pub)}
        onExportBibtex={handleExportBibtex}
        onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
      />

      <PublicationDialog
        open={isPublicationDialogOpen}
        onOpenChange={setIsPublicationDialogOpen}
        publication={editingPublication}
        vaults={vaults}
        tags={tags}
        publicationTags={editingPublication ? publicationTagsMap[editingPublication.id] || [] : []}
        onSave={handleSavePublication}
        onCreateTag={handleCreateTag}
      />

      <VaultDialog
        open={isVaultDialogOpen}
        onOpenChange={setIsVaultDialogOpen}
        vault={editingVault}
        onSave={handleSaveVault}
      />

      <AlertDialog open={!!deleteConfirmation} onOpenChange={() => setDeleteConfirmation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete publication?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteConfirmation?.title}". This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePublication} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
