import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag, PublicationRelation, VaultShare } from '@/types/database';
import { generateBibtexKey } from '@/lib/bibtex';
import { Sidebar } from '@/components/layout/Sidebar';
import { PublicationList } from '@/components/publications/PublicationList';
import { PublicationDialog } from '@/components/publications/PublicationDialog';
import { ImportDialog } from '@/components/publications/ImportDialog';
import { VaultDialog } from '@/components/vaults/VaultDialog';
import { RelationshipGraph } from '@/components/publications/RelationshipGraph';
import { ProfileDialog } from '@/components/profile/ProfileDialog';
import { ExportDialog } from '@/components/publications/ExportDialog';
import { QRCodeDialog } from '@/components/vaults/QRCodeDialog';
import { LoadingSpinner } from '@/components/ui/loading';
import { useToast } from '@/hooks/use-toast';
import { useVaultAccess } from '@/hooks/useVaultAccess';
import { useVaultContent } from '@/contexts/VaultContentContext';
import { Lock, Globe, Shield, Users, Calendar, User, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function VaultDetail() {
  const { id: vaultId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canView, canEdit, isOwner, userRole, accessStatus, vault, error: accessError, refresh } = useVaultAccess(vaultId || '');

  // Use the context for vault content data
  const {
    currentVault,
    publications,
    tags,
    publicationTags,
    publicationRelations,
    vaultShares,
    loading: contentLoading,
    error: contentError,
    setCurrentVaultId,
    setPublications,
    setTags,
    setPublicationTags,
    setPublicationRelations,
    setVaultShares
  } = useVaultContent();

  // Local state for UI elements
  const [vaultPapers, setVaultPapers] = useState<{[key: string]: string[]}>({});
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [sharedVaults, setSharedVaults] = useState<Vault[]>([]);
  const [allPublications, setAllPublications] = useState<Publication[]>([]);
  const [publicationVaultsMap, setPublicationVaultsMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [isPublicationDialogOpen, setIsPublicationDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingPublication, setEditingPublication] = useState<Publication | null>(null);

  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [editingVault, setEditingVault] = useState<Vault | null>(null);
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportPublications, setExportPublications] = useState<Publication[]>([]);

  const [deleteConfirmation, setDeleteConfirmation] = useState<Publication | null>(null);
  const [deleteVaultConfirmation, setDeleteVaultConfirmation] = useState<Vault | null>(null);

  // Fetch user's vaults and shared vaults separately
  const fetchUserVaults = useCallback(async () => {
    if (!user) return;

    try {
      // Fetch user's vaults
      const [ownedVaultsRes, sharedVaultsRes] = await Promise.all([
        supabase.from('vaults').select('*').eq('user_id', user.id).order('name'),
        supabase
          .from('vault_shares')
          .select('vault_id')
          .or(`shared_with_email.eq.${user.email},shared_with_user_id.eq.${user.id}`)
      ]);

      // Process shared vaults
      let processedSharedVaults: Vault[] = [];
      if (sharedVaultsRes.data && sharedVaultsRes.data.length > 0) {
        const sharedVaultIds = sharedVaultsRes.data.map(s => s.vault_id);
        const { data: sharedVaultDetails } = await supabase
          .from('vaults')
          .select('*')
          .in('id', sharedVaultIds);

        if (sharedVaultDetails) {
          processedSharedVaults = sharedVaultDetails as Vault[];
        }
      }

      if (ownedVaultsRes.data) setVaults(ownedVaultsRes.data as Vault[]);
      setSharedVaults(processedSharedVaults);
    } catch (error) {
      console.error('Error fetching user vaults:', error);
    }
  }, [user]);

  // Fetch all user publications
  const fetchAllPublications = useCallback(async () => {
    if (!user) return;

    try {
      const [pubsRes, vaultPubsRes] = await Promise.all([
        supabase
          .from('publications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('vault_publications')
          .select('*')
          .order('created_at', { ascending: false })
      ]);

      if (pubsRes.error) throw pubsRes.error;
      if (vaultPubsRes.error) throw vaultPubsRes.error;

      const publications = pubsRes.data as Publication[];
      const vaultPublications = vaultPubsRes.data as any[];

      setAllPublications(publications);

      // Create publicationVaultsMap to track which vaults each publication belongs to
      const newPublicationVaultsMap: Record<string, string[]> = {};

      // Initialize all publications with empty arrays
      allPublications.forEach(pub => {
        newPublicationVaultsMap[pub.id] = [];
      });

      // Map vault-specific copies to their vaults and also track original publications
      vaultPublications.forEach(vp => {
        // For vault-specific copies, map the vault_publications.id to the vault
        if (!newPublicationVaultsMap[vp.id]) {
          newPublicationVaultsMap[vp.id] = [];
        }
        newPublicationVaultsMap[vp.id].push(vp.vault_id);

        // Also map the original publication to the vault
        if (vp.original_publication_id) {
          if (!newPublicationVaultsMap[vp.original_publication_id]) {
            newPublicationVaultsMap[vp.original_publication_id] = [];
          }
          if (!newPublicationVaultsMap[vp.original_publication_id].includes(vp.vault_id)) {
            newPublicationVaultsMap[vp.original_publication_id].push(vp.vault_id);
          }
        }
      });

      setPublicationVaultsMap(newPublicationVaultsMap);
    } catch (error) {
      console.error('Error fetching all publications:', error);
    }
  }, [user]);

  // Initialize and update vault content when vaultId changes
  useEffect(() => {
    if (vaultId) {
      setCurrentVaultId(vaultId);
    }
  }, [vaultId, setCurrentVaultId]);

  // Fetch user's vaults and all publications when user changes
  useEffect(() => {
    if (user) {
      fetchUserVaults();
      fetchAllPublications();
    }
  }, [user, fetchUserVaults, fetchAllPublications]);

  // Check for pending access requests
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const processedApprovedRequestRef = useRef<string | null>(null);
  const lastCheckedVaultIdRef = useRef<string | null>(null);

  useEffect(() => {
    console.log('[VaultDetail] Checking for pending requests', { user: !!user, vaultId, vault: !!vault });
    if (user && vaultId) {
      // Only run if the vault ID has changed to prevent unnecessary checks
      if (lastCheckedVaultIdRef.current !== vaultId) {
        lastCheckedVaultIdRef.current = vaultId;

        const checkPendingRequest = async () => {
          // Only check if we have the vault object
          if (vault) {
            const { data: existingRequest } = await supabase
              .from('vault_access_requests')
              .select('id, status')
              .eq('vault_id', vault.id)
              .eq('requester_id', user.id)
              .in('status', ['pending', 'approved'])
              .maybeSingle();

            console.log('[VaultDetail] Pending request check result:', existingRequest);

            // Only refresh if we haven't already processed this specific request ID
            if (existingRequest && existingRequest.status === 'approved' &&
                existingRequest.id !== processedApprovedRequestRef.current) {
              console.log('[VaultDetail] Setting hasPendingRequest to false and refreshing');
              setHasPendingRequest(false);
              processedApprovedRequestRef.current = existingRequest.id;
              // Refresh to update access status
              refresh();
            } else if (existingRequest && existingRequest.status === 'pending') {
              console.log('[VaultDetail] Setting hasPendingRequest to true');
              setHasPendingRequest(true);
            } else {
              console.log('[VaultDetail] No existing request, setting hasPendingRequest to false');
              setHasPendingRequest(false);
            }
          }
        };

        checkPendingRequest();
      }
    } else {
      console.log('[VaultDetail] No user or vaultId, setting hasPendingRequest to false');
      setHasPendingRequest(false);
      processedApprovedRequestRef.current = null;
      lastCheckedVaultIdRef.current = null;
    }
  }, [user, vaultId, refresh]); // Removed 'vault' from dependencies to prevent continuous re-runs

  // Combine loading states
  const combinedLoading = authLoading || contentLoading;

  // Create publication tags map from the context data
  // In the copy-based model with vault-specific tags, we need to map from vault publication IDs to tags
  // by connecting vault_publications.id to publication_tags.vault_publication_id
  const publicationTagsMap: Record<string, string[]> = useMemo(() => {
    const map: Record<string, string[]> = {};

    // Create a mapping from vault publication IDs to tags
    const vaultPubTagsMap: Record<string, string[]> = {};
    publicationTags.forEach((pt) => {
      // Use vault_publication_id if available, otherwise fall back to publication_id
      const vaultPubId = pt.vault_publication_id || pt.publication_id;
      if (!vaultPubTagsMap[vaultPubId]) vaultPubTagsMap[vaultPubId] = [];
      vaultPubTagsMap[vaultPubId].push(pt.tag_id);
    });

    // Then, for each publication in the vault, map its ID to the corresponding tags
    publications.forEach(pub => {
      // In the copy-based model, publications are vault-specific copies
      // Look up the tags using the vault publication ID
      map[pub.id] = vaultPubTagsMap[pub.id] || [];
    });

    return map;
  }, [publicationTags, publications]);

  // Build relations count map (bidirectional)
  // In the copy-based model, we need to map relations to vault publication IDs
  const relationsCountMap: Record<string, number> = useMemo(() => {
    // Create a lookup map for faster publication ID resolution
    const originalToVaultMap = new Map<string, string>();
    publications.forEach(pub => {
      if (pub.original_publication_id) {
        originalToVaultMap.set(pub.original_publication_id, pub.id);
      }
    });

    const map: Record<string, number> = {};
    publicationRelations.forEach((rel) => {
      // Map original publication IDs to vault publication IDs using the lookup map
      const vaultPubId1 = originalToVaultMap.get(rel.publication_id) || rel.publication_id;
      const vaultPubId2 = originalToVaultMap.get(rel.related_publication_id) || rel.related_publication_id;

      map[vaultPubId1] = (map[vaultPubId1] || 0) + 1;
      map[vaultPubId2] = (map[vaultPubId2] || 0) + 1;
    });
    return map;
  }, [publicationRelations, publications]);

  // Update vaultPapers map based on current publications
  useEffect(() => {
    const papersMap: {[key: string]: string[]} = {};
    if (currentVault?.id) {
      papersMap[currentVault.id] = publications.map(p => p.id);
    }
    setVaultPapers(papersMap);
  }, [currentVault, publications]);

  // Set loading to false when content is loaded
  useEffect(() => {
    if (!combinedLoading) {
      setLoading(false);
    }
  }, [combinedLoading]);

  const refetchVault = async () => {
    if (!user || !vaultId) return;
    refresh(); // Use the refresh function from the hook
  };

  const refetchRelations = async () => {
    if (!user || !vaultId) return;
    try {
      // Just call the refresh function to update all data including relations
      refresh();
    } catch (error) {
      console.error('Error refetching publication relations:', error);
    }
  };

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
    if (!user || !vaultId || !canEdit) return; // Only allow editing if user has edit permission

    try {
      if (editingPublication) {
        // In the copy-based model, the editingPublication is already a vault-specific copy
        // Its ID is from vault_publications.id
        const dataToSave = {
          ...data,
          bibtex_key: data.bibtex_key || generateBibtexKey({ ...editingPublication, ...data } as Publication),
          updated_at: new Date().toISOString()
        };

        const { data: updatedVaultPub, error } = await supabase
          .from('vault_publications')
          .update(dataToSave)
          .eq('id', editingPublication.id) // editingPublication.id is the vault_publications.id
          .select()
          .single();

        if (error) throw error;

        // Optimistic update - update the publication in the local state
        setPublications(prev => prev.map(p =>
          p.id === editingPublication.id ? { ...p, ...updatedVaultPub } as Publication : p
        ));

        // Update tags - in the copy-based model, we need to use the original publication ID for tagging
        // Get the original publication ID from the vault publication record
        console.log('Updating tags for publication:', editingPublication.id, 'with tagIds:', tagIds);

        const { data: vaultPubRecord, error: vaultPubError } = await supabase
          .from('vault_publications')
          .select('original_publication_id')
          .eq('id', editingPublication.id)
          .single();

        if (vaultPubError) {
          console.error('Error fetching vault publication record:', vaultPubError);
          throw vaultPubError;
        }

        const originalPublicationId = vaultPubRecord?.original_publication_id || editingPublication.id;
        console.log('Original publication ID:', originalPublicationId);

        // For vault-specific copies, we should use vault_publication_id instead of publication_id
        // Get existing tag associations for this vault-specific copy
        const { data: existingTags, error: fetchError } = await supabase
          .from('publication_tags')
          .select('tag_id')
          .eq('vault_publication_id', editingPublication.id); // Use the vault-specific copy ID

        if (fetchError) {
          console.error('Error fetching existing tags for vault copy:', fetchError);
          throw fetchError;
        }

        const existingTagIds = existingTags?.map(tag => tag.tag_id) || [];

        // Determine which tags to remove (exist but not in new selection)
        const tagsToRemove = existingTagIds.filter(existingId => !tagIds.includes(existingId));

        // Delete tags that are no longer selected for this vault-specific copy
        if (tagsToRemove.length > 0) {
          const { error: deleteError } = await supabase
            .from('publication_tags')
            .delete()
            .eq('vault_publication_id', editingPublication.id) // Use the vault-specific copy ID
            .in('tag_id', tagsToRemove);

          if (deleteError) {
            console.error('Error deleting existing tags for vault copy:', deleteError);
            throw deleteError;
          }
        }

        // Determine which tags to add (in new selection but don't exist yet)
        const tagsToAdd = tagIds.filter(newId => !existingTagIds.includes(newId));

        if (tagsToAdd.length > 0) {
          console.log('Inserting new tag associations for vault copy:', tagsToAdd);
          const { error: insertError } = await supabase.from('publication_tags').insert(
            tagsToAdd.map((tagId) => ({
              publication_id: null, // Set to null for vault-specific copies
              vault_publication_id: editingPublication.id, // Use the vault-specific copy ID
              tag_id: tagId,
            }))
          );

          if (insertError) {
            console.error('Error inserting new tags for vault copy:', insertError);
            throw insertError;
          }
        } else {
          console.log('No new tags to insert for vault copy');
        }

        // Update publication tags in local state
        setPublicationTags(prev => [
          ...prev.filter(pt => pt.vault_publication_id !== editingPublication.id),
          ...tagIds.map(tagId => ({ id: crypto.randomUUID(), vault_publication_id: editingPublication.id, tag_id: tagId }))
        ]);

        console.log('Tags updated successfully');

        // Update editingPublication with new data so dialog stays in sync
        if (isAutoSave) {
          setEditingPublication({ ...editingPublication, ...data } as Publication);
        }

        if (!isAutoSave) {
          toast({ title: 'paper_updated ✨' });
        }
      } else {
        // Creating a new publication - this would be added to the user's personal publications first
        // Then it would be copied to the vault using handleAddToVaults

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

        // Add to vault by creating a copy in vault_publications
        const { error: vaultPubError } = await supabase
          .from('vault_publications')
          .insert({
            vault_id: vaultId,
            original_publication_id: newPub.id,
            title: newPub.title,
            authors: newPub.authors,
            year: newPub.year,
            journal: newPub.journal,
            volume: newPub.volume,
            issue: newPub.issue,
            pages: newPub.pages,
            doi: newPub.doi,
            url: newPub.url,
            abstract: newPub.abstract,
            pdf_url: newPub.pdf_url,
            bibtex_key: newPub.bibtex_key,
            publication_type: newPub.publication_type,
            notes: newPub.notes,
            booktitle: newPub.booktitle,
            chapter: newPub.chapter,
            edition: newPub.edition,
            editor: newPub.editor,
            howpublished: newPub.howpublished,
            institution: newPub.institution,
            number: newPub.number,
            organization: newPub.organization,
            publisher: newPub.publisher,
            school: newPub.school,
            series: newPub.series,
            type: newPub.type,
            eid: newPub.eid,
            isbn: newPub.isbn,
            issn: newPub.issn,
            keywords: newPub.keywords,
            created_by: user.id,
          });

        if (vaultPubError) throw vaultPubError;

        // After creating the vault-specific copy, we need to get its ID to assign tags
        // First, get the vault-specific copy that was just created
        const { data: vaultPub, error: vaultPubFetchError } = await supabase
          .from('vault_publications')
          .select('id')
          .eq('original_publication_id', newPub.id)
          .eq('vault_id', vaultId)
          .single();

        if (vaultPubFetchError) {
          console.error('Error fetching vault publication after creation:', vaultPubFetchError);
          throw vaultPubFetchError;
        }

        if (tagIds.length > 0 && newPub) {
          await supabase.from('publication_tags').insert(
            tagIds.map((tagId) => ({
              publication_id: null, // Set to null for vault-specific copies
              vault_publication_id: vaultPub.id, // For newly created publications in vaults, use the vault-specific copy ID
              tag_id: tagId,
            }))
          );
        }

        // Optimistic update
        setPublications(prev => [newPub as Publication, ...prev]);
        if (tagIds.length > 0 && newPub) {
          setPublicationTags(prev => [
            ...prev,
            ...tagIds.map(tagId => ({ id: crypto.randomUUID(), vault_publication_id: vaultPub.id, tag_id: tagId }))
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
    if (!user || !vaultId || !canEdit) return; // Only allow importing if user has edit permission

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

    // Add imported publications to this vault using the copy-based model
    if (insertedPubs) {
      for (const pub of insertedPubs) {
        await supabase.rpc('copy_publication_to_vault', {
          pub_id: pub.id,
          target_vault_id: vaultId,
          user_id: user.id
        });
      }

      // Optimistic update - reload publications to include the vault copies
      // Note: The actual reloading happens via the context effect when data changes
      setPublications(prev => [...(insertedPubs as Publication[]), ...prev]);
    }
  };

  const handleAddToVaults = async (publicationId: string, vaultIds: string[]) => {
    if (!user || !canEdit) return; // Only allow adding if user has edit permission

    try {
      // Verify the publication exists and belongs to the user
      const { data: publication, error: pubError } = await supabase
        .from('publications')
        .select('*')
        .eq('id', publicationId)
        .eq('user_id', user.id)
        .single();

      if (pubError || !publication) throw new Error('Publication not found');

      // For each vault, create a copy of the publication using the RPC function
      for (const vaultIdToAdd of vaultIds) {
        // Check if publication is already in this vault (as a copy)
        const { data: existingCopy, error: checkError } = await supabase
          .from('vault_publications')
          .select('*')
          .eq('vault_id', vaultIdToAdd)
          .eq('original_publication_id', publicationId)
          .maybeSingle();

        if (checkError) throw checkError;

        // Only add if not already in vault as a copy
        if (!existingCopy) {
          const { error: insertError } = await supabase.rpc('copy_publication_to_vault', {
            pub_id: publicationId,
            target_vault_id: vaultIdToAdd,
            user_id: user.id
          });

          if (insertError) throw insertError;
        }
      }

      toast({ title: `added_to_${vaultIds.length}_vault${vaultIds.length > 1 ? 's' : ''} ✨` });

      // Refresh the data to reflect the changes
      refresh();
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
    if (!deleteConfirmation || !vaultId || !canEdit) return; // Only allow deletion if user has edit permission

    const deletedId = deleteConfirmation.id;

    try {
      // In the copy-based model, we're dealing with vault_publications records
      // Delete the vault-specific copy
      const { error } = await supabase
        .from('vault_publications')
        .delete()
        .eq('id', deletedId); // deletedId refers to vault_publications.id

      if (error) throw error;

      // Optimistic update
      setPublications(prev => prev.filter(p => p.id !== deletedId));
      setPublicationTags(prev => prev.filter(pt => pt.publication_id !== deletedId));

      toast({ title: 'paper_deleted' });
    } catch (error) {
      // Revert on error
      refetchVault();
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
    if (!deleteVaultConfirmation || !isOwner) return; // Only allow deletion if user is the owner

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
      navigate('/dashboard');

      const { error } = await supabase
        .from('vaults')
        .delete()
        .eq('id', deletedId);

      if (error) throw error;

      toast({ title: 'vault_deleted' });
      setIsVaultDialogOpen(false);
    } catch (error) {
      // Revert on error
      refetchVault();
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
    if (!user || !vaultId || !canEdit) return null; // Only allow creating tags if user has edit permission

    try {
      // Check if a tag with the same name already exists in this vault
      const { data: existingTag, error: existingTagError } = await supabase
        .from('tags')
        .select('id')
        .eq('vault_id', vaultId)
        .eq('name', name)
        .maybeSingle();

      if (existingTag) {
        toast({
          title: 'Tag already exists',
          description: `A tag with the name "${name}" already exists in this vault.`,
          variant: 'destructive',
        });
        return null;
      }

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
        .insert({ name, color, user_id: user.id, parent_id: parentId || null, vault_id: vaultId })
        .select()
        .single();

      if (error) throw error;

      setTags(prev => [...prev, data as Tag]);
      return data as Tag;
    } catch (error) {
      // Check if the error is due to the unique constraint violation
      if ((error as any)?.code === '23505') { // PostgreSQL unique violation error code
        toast({
          title: 'Tag already exists',
          description: `A tag with the name "${name}" already exists in this vault.`,
          variant: 'destructive',
        });
        return null;
      }

      toast({
        title: 'error_creating_tag',
        description: (error as Error).message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleUpdateTag = async (tagId: string, updates: Partial<Tag>): Promise<Tag | null> => {
    if (!user || !canEdit) return null; // Only allow updating tags if user has edit permission

    try {
      const { data, error } = await supabase
        .from('tags')
        .update(updates)
        .eq('id', tagId)
        .select()
        .single();

      if (error) throw error;

      setTags(prev => prev.map(tag => tag.id === tagId ? { ...tag, ...data } as Tag : tag));
      return data as Tag;
    } catch (error) {
      toast({
        title: 'error_updating_tag',
        description: (error as Error).message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleSaveVault = async (data: Partial<Vault>) => {
    if (!user || !vaultId || !isOwner) return; // Only allow saving if user is the owner

    try {
      if (editingVault) {
        const { data: updatedVault, error } = await supabase
          .from('vaults')
          .update(data)
          .eq('id', editingVault.id)
          .select()
          .single();

        if (error) throw error;

        // Update the vault in the hook's state
        refresh();
        toast({ title: 'vault_updated ✨' });
      } else {
        const { data: newVault, error } = await supabase
          .from('vaults')
          .insert([{ ...data, user_id: user.id } as Omit<Vault, 'id' | 'created_at' | 'updated_at'>])
          .select()
          .single();

        if (error) throw error;

        // Update the vault in the hook's state
        refresh();
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

  // State to track loading state to prevent flickering
  const [hasStartedLoading, setHasStartedLoading] = useState(false);
  const [finishedLoading, setFinishedLoading] = useState(false);
  const [loadingCompletedAt, setLoadingCompletedAt] = useState<number | null>(null);

  // Track loading state changes to prevent flickering
  useEffect(() => {
    const isLoading = accessStatus === 'loading' || authLoading || contentLoading;
    console.log('[VaultDetail] Loading state changed:', {
      accessStatus,
      authLoading,
      contentLoading,
      isLoading,
      hasStartedLoading,
      finishedLoading,
      loadingCompletedAt,
      timestamp: Date.now()
    });

    if (!hasStartedLoading && (accessStatus === 'loading' || authLoading || contentLoading)) {
      // Mark when initial loading starts
      console.log('[VaultDetail] Initial loading started');
      setHasStartedLoading(true);
    }

    if (hasStartedLoading && !isLoading && !finishedLoading) {
      // Mark when all loading is complete
      console.log('[VaultDetail] All loading completed');
      setFinishedLoading(true);
      setLoadingCompletedAt(Date.now());
    }
  }, [accessStatus, authLoading, contentLoading, hasStartedLoading, finishedLoading]);

  // Minimum time to show loading screen to prevent flickering
  const MIN_LOADING_DISPLAY_TIME = 300; // 300ms minimum loading display time

  // Determine if we should show the loading screen
  const shouldShowLoading = hasStartedLoading && (
    !finishedLoading ||
    (loadingCompletedAt && Date.now() - loadingCompletedAt < MIN_LOADING_DISPLAY_TIME)
  );

  console.log('[VaultDetail] Render - shouldShowLoading:', shouldShowLoading, {
    hasStartedLoading,
    finishedLoading,
    loadingCompletedAt,
    timeSinceComplete: loadingCompletedAt ? Date.now() - loadingCompletedAt : null,
    minDisplayTime: MIN_LOADING_DISPLAY_TIME,
    shouldStillShow: loadingCompletedAt && Date.now() - loadingCompletedAt < MIN_LOADING_DISPLAY_TIME
  });

  // Show loading state while access is being checked and content is loading
  // Only show "not found" after access check is complete and confirmed inaccessible
  if (shouldShowLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8 max-w-md mx-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto shadow-lg">
            <div className="w-10 h-10 border-3 border-white/50 border-t-white rounded-full animate-spin" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2 font-mono">initializing_vault...</h1>
            <p className="text-muted-foreground font-mono text-sm mb-4">
              // loading_vault_contents
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Check if vault exists but access is denied/requestable
  // Only show "not found" after access check is complete and confirmed inaccessible
  const isVaultAccessible = vault || (accessStatus === 'requestable' && !!vaultId);

  if (!isVaultAccessible) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8 max-w-md mx-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto shadow-lg">
            <div className="w-10 h-10 border-3 border-white/50 border-t-white rounded-full animate-spin" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2 font-mono">vault_not_found</h1>
            <p className="text-muted-foreground font-mono text-sm mb-4">
              // this_vault_doesnt_exist_or_was_removed
            </p>
            <Button
              onClick={() => navigate('/dashboard')}
              className="font-mono"
            >
              back_to_dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // If user doesn't have access to a protected vault, show access request page
  if (!canView && (vault || accessStatus === 'requestable') &&
      ((vault && vault.visibility === 'protected') || accessStatus === 'requestable')) {

    // Use the vault from hook if available, otherwise fetch basic info for display
    const displayVault = vault || {
      id: vaultId || '',
      name: 'Protected Vault',
      description: 'This vault is protected. Request access to view its contents.',
      visibility: 'protected',
      updated_at: new Date().toISOString(),
      user_id: '',
      color: '#6366f1',
      created_at: new Date().toISOString()
    };

    return (
      <div className="min-h-screen bg-background flex">
        <Sidebar
          vaults={vaults}
          sharedVaults={sharedVaults}
          selectedVaultId={null}
          onSelectVault={() => {}}
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

        <div className="flex-1 lg:pl-72 min-w-0 flex items-center justify-center p-4">
          <Card className="w-full max-w-md mx-auto">
            <CardHeader className="text-center">
              <Shield className="w-12 h-12 mx-auto text-orange-500 mb-4" />
              <CardTitle className="text-xl">Protected Vault</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="mb-6 text-muted-foreground">
                This vault is protected. Request access to view its contents.
              </p>
              <div className="space-y-4">
                <div className="text-left">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">{displayVault.name}</h3>
                    {displayVault.visibility !== 'private' && (
                      <QRCodeDialog vault={displayVault} onVaultUpdate={refresh} />
                    )}
                  </div>
                  {displayVault.description && (
                    <p className="text-sm text-muted-foreground mb-4">{displayVault.description}</p>
                  )}
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Updated: {new Date(displayVault.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={async () => {
                    console.log('[VaultDetail] Request Access button clicked', { user: !!user, displayVault: displayVault?.id });
                    if (!user) {
                      console.log('[VaultDetail] User not authenticated');
                      toast({
                        title: "Authentication Required",
                        description: "Please sign in to request access to this vault.",
                        variant: "destructive",
                      });
                      return;
                    }

                    try {
                      console.log('[VaultDetail] Checking for existing requests');
                      // Check if user already has a pending request
                      const { data: existingRequest } = await supabase
                        .from('vault_access_requests')
                        .select('id, status')
                        .eq('vault_id', displayVault.id)
                        .eq('requester_id', user.id)
                        .in('status', ['pending', 'approved'])
                        .maybeSingle();

                      console.log('[VaultDetail] Existing request check result:', existingRequest);
                      if (existingRequest) {
                        if (existingRequest.status === 'pending') {
                          console.log('[VaultDetail] Request already pending');
                          toast({
                            title: "Request Already Pending",
                            description: "Your access request is currently pending approval by the vault owner.",
                            variant: "default",
                          });
                          return;
                        } else if (existingRequest.status === 'approved') {
                          console.log('[VaultDetail] Access already approved');
                          toast({
                            title: "Access Already Approved",
                            description: "Your access has already been approved. Refreshing the page...",
                            variant: "default",
                          });
                          refresh();
                          return;
                        }
                      }

                      console.log('[VaultDetail] Sending new access request');
                      // Use the helper function from the hook
                      const result = await requestVaultAccess(displayVault.id, user.id, '');

                      if (result.error) throw result.error;

                      toast({
                        title: "Access Requested",
                        description: "Your request has been sent to the vault owner.",
                      });

                      // Refresh the access status
                      refresh();
                    } catch (error) {
                      console.error('[VaultDetail] Error requesting access:', error);
                      toast({
                        title: "Error Requesting Access",
                        description: (error as Error).message,
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  {hasPendingRequest ? 'Request Pending...' : 'Request Access'}
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate('/dashboard')}
                >
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Determine vault visibility badge
  const visibilityBadge = (() => {
    switch (vault.visibility) {
      case 'public':
        return <Badge variant="secondary" className="ml-2"><Globe className="w-3 h-3 mr-1" /> Public</Badge>;
      case 'protected':
        return <Badge variant="default" className="ml-2 bg-orange-500 hover:bg-orange-600"><Shield className="w-3 h-3 mr-1" /> Protected</Badge>;
      case 'private':
        return <Badge variant="destructive" className="ml-2"><Lock className="w-3 h-3 mr-1" /> Private</Badge>;
      default:
        return null;
    }
  })();

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        vaults={vaults}
        sharedVaults={sharedVaults}
        selectedVaultId={currentVault?.id || null}
        onSelectVault={() => {}}
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
        {/* Vault Header */}
        <div className="border-b bg-card/50 backdrop-blur-xl sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold truncate">{currentVault?.name || 'Loading...'}</h1>
                {visibilityBadge}
                {userRole && (
                  <Badge variant={userRole === 'owner' ? 'default' : userRole === 'editor' ? 'secondary' : 'outline'}>
                    {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                  </Badge>
                )}
                {currentVault && <QRCodeDialog vault={currentVault} onVaultUpdate={refetchVault} />}
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>Last updated: {currentVault?.updated_at ? new Date(currentVault.updated_at).toLocaleDateString() : 'Loading...'}</span>
              </div>
            </div>

            {currentVault?.description && (
              <p className="mt-2 text-muted-foreground text-sm">{currentVault.description}</p>
            )}
          </div>
        </div>

        <PublicationList
          publications={publications}
          tags={tags}
          vaults={vaults.concat(sharedVaults)}
          publicationTagsMap={publicationTagsMap}
          publicationVaultsMap={publicationVaultsMap}
          relationsCountMap={relationsCountMap}
          selectedVault={currentVault}
          onAddPublication={canEdit ? () => {
            setEditingPublication(null);
            setIsPublicationDialogOpen(true);
          } : () => {
            toast({
              title: 'read_only_vault',
              description: 'You have viewer permissions. Contact the owner to edit papers.',
              variant: 'destructive',
            });
          }}
          onImportPublications={canEdit ? () => setIsImportDialogOpen(true) : () => {
            toast({
              title: 'read_only_vault',
              description: 'You have viewer permissions. Contact the owner to import papers.',
              variant: 'destructive',
            });
          }}
          onEditPublication={canEdit ? (pub) => {
            setEditingPublication(pub);
            setIsPublicationDialogOpen(true);
          } : (pub) => {
            toast({
              title: 'read_only_vault',
              description: 'You have viewer permissions. Contact the owner to edit papers.',
              variant: 'destructive',
            });
          }}
          onDeletePublication={canEdit ? (pub) => setDeleteConfirmation(pub) : (pub) => {
            toast({
              title: 'read_only_vault',
              description: 'You have viewer permissions. Contact the owner to delete papers.',
              variant: 'destructive',
            });
          }}
          onExportBibtex={handleExportBibtex}
          onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
          onOpenGraph={() => setIsGraphOpen(true)}
          onEditVault={isOwner && currentVault ? (vault) => {
            setEditingVault(vault);
            setIsVaultDialogOpen(true);
          } : undefined}
          onVaultUpdate={refetchVault}
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
        vaults={vaults.concat(sharedVaults)} // Pass all user's vaults and shared vaults
        tags={tags}
        publicationTags={editingPublication ? publicationTagsMap[editingPublication.id] || [] : []}
        allPublications={allPublications} // Use all publications to show in which vaults this publication exists
        publicationVaults={editingPublication ? publicationVaultsMap[editingPublication.id] || [] : []} // Show which vaults this publication is already in
        onSave={canEdit ? handleSavePublication : undefined}
        onCreateTag={canEdit ? handleCreateTag : undefined}
        onAddToVaults={canEdit ? handleAddToVaults : undefined}
      />

      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        vaults={[vault]}
        allPublications={allPublications}
        currentVaultId={vaultId || null}
        onImport={canEdit ? handleBulkImport : undefined}
        onAddToVaults={canEdit ? handleAddToVaults : undefined}
      />

      <VaultDialog
        open={isVaultDialogOpen}
        onOpenChange={(open) => {
          setIsVaultDialogOpen(open);
        }}
        vault={editingVault}
        onSave={isOwner ? handleSaveVault : undefined}
        onUpdate={refetchVault}
        onDelete={isOwner ? (vault) => {
          setDeleteVaultConfirmation(vault);
          setIsVaultDialogOpen(false);
        } : undefined}
      />

      <ProfileDialog
        open={isProfileDialogOpen}
        onOpenChange={setIsProfileDialogOpen}
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
        vaultName={vault?.name}
      />
    </div>
  );
}