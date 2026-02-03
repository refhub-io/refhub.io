import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag, PublicationRelation, VaultShare } from '@/types/database';
import { generateBibtexKey } from '@/lib/bibtex';
import { formatTimeAgo } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { Sidebar } from '@/components/layout/Sidebar';
import { PublicationList } from '@/components/publications/PublicationList';
import { PublicationDialog } from '@/components/publications/PublicationDialog';
import { ImportDialog } from '@/components/publications/ImportDialog';
import { VaultDialog } from '@/components/vaults/VaultDialog';
import { RelationshipGraph } from '@/components/publications/RelationshipGraph';
import { ProfileDialog } from '@/components/profile/ProfileDialog';
import { ExportDialog } from '@/components/publications/ExportDialog';
import { QRCodeDialog } from '@/components/vaults/QRCodeDialog';
import { LoadingSpinner, PhaseLoader, LoadingPhase } from '@/components/ui/loading';
import { useToast } from '@/hooks/use-toast';
import { useVaultAccess, requestVaultAccess } from '@/hooks/useVaultAccess';
import { useVaultFavorites } from '@/hooks/useVaultFavorites';
import { useVaultFork } from '@/hooks/useVaultFork';
import { useVaultContent } from '@/contexts/VaultContentContext';
import { useSharedVaultOperations } from '@/hooks/useSharedVaultOperations';
import { Lock, Globe, Shield, Users, Clock, User, ExternalLink, Sparkles, Crown, Edit, Eye, Heart, GitFork } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

export default function VaultDetail() {
  const { id: vaultId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canView, canEdit, isOwner, userRole, accessStatus, vault, error: accessError, refresh } = useVaultAccess(vaultId || '');
  const { isFavorite, toggleFavorite } = useVaultFavorites();
  const { forkVault } = useVaultFork();
  const [forking, setForking] = useState(false);

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
    setVaultShares,
    refreshVaultContent,
    isRealtimeConnected,
    lastActivity,
    updateLastActivity,
  } = useVaultContent();

  // Use the shared vault operations hook for optimistic updates
  const sharedVaultOps = useSharedVaultOperations({
    vaultId: vaultId || null,
    userId: user?.id || null,
    canEdit,
    publications,
    setPublications,
    tags,
    setTags,
    publicationTags,
    setPublicationTags,
  });

  // Local state for UI elements
  const [vaultPapers, setVaultPapers] = useState<{[key: string]: string[]}>({});
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [sharedVaults, setSharedVaults] = useState<Vault[]>([]);
  const [allPublications, setAllPublications] = useState<Publication[]>([]);
  const [publicationVaultsMap, setPublicationVaultsMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [forkCount, setForkCount] = useState(0);
  const [vaultOwner, setVaultOwner] = useState<{ display_name: string | null; username: string | null } | null>(null);

  // Loading phases for the vault loader
  const [loadingPhases, setLoadingPhases] = useState<LoadingPhase[]>([
    { id: 'auth', label: 'checking_access', status: 'loading' },
    { id: 'vault', label: 'loading_vault_metadata', status: 'pending' },
    { id: 'publications', label: 'fetching_publications', status: 'pending' },
    { id: 'tags', label: 'syncing_tags', status: 'pending' },
    { id: 'relations', label: 'mapping_connections', status: 'pending' },
  ]);

  const updatePhase = useCallback((phaseId: string, status: LoadingPhase['status']) => {
    setLoadingPhases(prev => {
      const newPhases = prev.map(p => 
        p.id === phaseId ? { ...p, status } : p
      );
      // Auto-start next pending phase when one completes
      if (status === 'complete') {
        const nextPendingIndex = newPhases.findIndex(p => p.status === 'pending');
        if (nextPendingIndex !== -1) {
          newPhases[nextPendingIndex] = { ...newPhases[nextPendingIndex], status: 'loading' };
        }
      }
      return newPhases;
    });
  }, []);

  const [isPublicationDialogOpen, setIsPublicationDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingPublication, setEditingPublication] = useState<Publication | null>(null);
  const currentlyEditingPublicationId = useRef<string | null>(null);

  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [editingVault, setEditingVault] = useState<Vault | null>(null);
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportPublications, setExportPublications] = useState<Publication[]>([]);

  const [deleteConfirmation, setDeleteConfirmation] = useState<Publication | null>(null);
  const [deleteVaultConfirmation, setDeleteVaultConfirmation] = useState<Vault | null>(null);

  // Track loading phase updates based on access status and content
  useEffect(() => {
    if (accessStatus === 'granted' || accessStatus === 'denied' || accessStatus === 'requestable' || accessStatus === 'pending') {
      updatePhase('auth', 'complete');
    }
  }, [accessStatus, updatePhase]);

  useEffect(() => {
    if (vault) {
      updatePhase('vault', 'complete');
    }
  }, [vault, updatePhase]);

  useEffect(() => {
    if (publications.length > 0 || (!contentLoading && vault)) {
      updatePhase('publications', 'complete');
    }
  }, [publications, contentLoading, vault, updatePhase]);

  useEffect(() => {
    if (tags.length > 0 || (!contentLoading && vault)) {
      updatePhase('tags', 'complete');
    }
  }, [tags, contentLoading, vault, updatePhase]);

  useEffect(() => {
    if (!contentLoading && vault) {
      updatePhase('relations', 'complete');
    }
  }, [contentLoading, vault, updatePhase]);

  // Sync editingPublication with publications array for realtime updates
  // This ensures the dialog shows updated notes when another client makes changes
  useEffect(() => {
    if (editingPublication && currentlyEditingPublicationId.current) {
      const updatedPub = publications.find(p => p.id === currentlyEditingPublicationId.current);
      if (updatedPub && updatedPub.updated_at !== editingPublication.updated_at) {
        // Only update if the publication was actually changed (different updated_at)
        setEditingPublication(updatedPub);
      }
    }
  }, [publications, editingPublication]);

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

  // Fetch favorites and forks count for the current vault
  useEffect(() => {
    const fetchVaultStats = async () => {
      if (!vault) return;
      
      const [favRes, forkRes, ownerRes] = await Promise.all([
        supabase
          .from('vault_favorites')
          .select('*', { count: 'exact', head: true })
          .eq('vault_id', vault.id),
        supabase
          .from('vault_forks')
          .select('*', { count: 'exact', head: true })
          .eq('original_vault_id', vault.id),
        // Fetch vault owner profile for shared vaults
        supabase
          .from('profiles')
          .select('display_name, username')
          .eq('user_id', vault.user_id)
          .maybeSingle(),
      ]);
      
      setFavoritesCount(favRes.count || 0);
      setForkCount(forkRes.count || 0);
      setVaultOwner(ownerRes.data);
    };
    
    fetchVaultStats();
  }, [vault]);

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
    fetchUserVaults(); // Also refresh sidebar vaults to update visibility icons
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

  const handleSavePublication = async (data: Partial<Publication>, tagIds: string[], vaultIds?: string[], isAutoSave = false) => {
    if (!user || !vaultId || !canEdit) return; // Only allow editing if user has edit permission

    try {
      if (editingPublication) {
        // Use the optimistic update hook for updating publications
        const dataToSave = {
          ...data,
          bibtex_key: data.bibtex_key || generateBibtexKey({ ...editingPublication, ...data } as Publication),
        };

        // Use optimistic update for publication data
        const pubResult = await sharedVaultOps.updateVaultPublication(
          editingPublication.id,
          dataToSave,
          { silent: isAutoSave }
        );

        if (!pubResult.success) {
          throw pubResult.error || new Error('Failed to update publication');
        }

        // Use optimistic update for tags
        const tagResult = await sharedVaultOps.updatePublicationTags(
          editingPublication.id,
          tagIds,
          { silent: true } // Tags are updated silently, toast shown with pub update
        );

        if (!tagResult.success) {
          console.error('Error updating tags:', tagResult.error);
          // Don't throw - publication was already saved successfully
        }

        // Update editingPublication with new data so dialog stays in sync
        if (isAutoSave) {
          setEditingPublication({ ...editingPublication, ...data } as Publication);
        } else {
          // Update last activity for the updated publication
          updateLastActivity('publication_updated', user.id);
        }

        if (!isAutoSave) {
          // Only show toast if not already shown by optimistic update
          // toast({ title: 'paper_updated ✨' }); // Already shown by sharedVaultOps
        }
      } else {
        // Creating a new publication
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
          bibtex_key: data.bibtex_key || generateBibtexKey(data as Publication),
        };

        // Use the optimistic update hook for creating publications in the current vault
        const result = await sharedVaultOps.createVaultPublication(dataToSave, tagIds);

        if (!result.success) {
          throw result.error || new Error('Failed to create publication');
        }

        // If vaultIds are specified and include other vaults, add to those vaults too
        if (vaultIds && vaultIds.length > 0 && result.publication) {
          const otherVaultIds = vaultIds.filter(id => id !== vaultId);
          if (otherVaultIds.length > 0) {
            try {
              await handleAddToVaults(result.publication.id, otherVaultIds);
            } catch (error) {
              console.error('Error adding to additional vaults:', error);
              // Don't throw - the publication was created successfully in the main vault
            }
          }
        }

        // Update last activity for the new publication
        updateLastActivity('publication_added', user.id);
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

  const handleBulkImport = async (publicationsToImport: Partial<Publication>[], targetVaultId?: string | null): Promise<string[]> => {
    if (!user || !canEdit) return []; // Only allow importing if user has edit permission

    // Use the provided targetVaultId or fall back to current vaultId
    const effectiveVaultId = targetVaultId || vaultId;

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
      return [];
    }

    try {
      const { data: insertedPubs, error } = await supabase
        .from('publications')
        .insert(pubsToInsert as Omit<Publication, 'id' | 'created_at' | 'updated_at'>[])
        .select();

      if (error) throw error;

      const insertedIds: string[] = [];

      // Add imported publications to the target vault using the copy-based model
      if (insertedPubs && effectiveVaultId) {
        for (const pub of insertedPubs) {
          await supabase.rpc('copy_publication_to_vault', {
            pub_id: pub.id,
            target_vault_id: effectiveVaultId,
            user_id: user.id
          });
          insertedIds.push(pub.id);
        }

        // Don't manually update state here - realtime subscription will handle it
        // This prevents duplicate entries when realtime INSERT fires
        
        // Update last activity for bulk import
        updateLastActivity('publication_added', user.id);
      } else if (insertedPubs) {
        // No vault specified, just return the IDs
        insertedIds.push(...insertedPubs.map(p => p.id));
      }

      return insertedIds;
    } catch (error) {
      toast({
        title: 'error_importing_papers',
        description: (error as Error).message,
        variant: 'destructive',
      });
      return [];
    }
  };

  const handleAddToVaults = async (publicationId: string, vaultIds: string[]) => {
    if (!user || !canEdit) return; // Only allow adding if user has edit permission

    try {
      // The publicationId might be a vault_publications.id (when viewing a vault)
      // or a publications.id (when viewing the library). We need to resolve it.
      let sourcePublicationId = publicationId;
      let sourcePublication: Record<string, unknown> | null = null;

      // First, check if this ID is a vault_publication
      const { data: vaultPub } = await supabase
        .from('vault_publications')
        .select('*, original_publication_id')
        .eq('id', publicationId)
        .maybeSingle();

      if (vaultPub) {
        // This is a vault_publication - use it as the source data
        // If it has an original_publication_id, use that for tracking
        sourcePublicationId = vaultPub.original_publication_id || publicationId;
        sourcePublication = vaultPub;
      } else {
        // Try to find it in the publications table
        const { data: publication, error: pubError } = await supabase
          .from('publications')
          .select('*')
          .eq('id', publicationId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (pubError) throw pubError;
        if (!publication) throw new Error('Publication not found');
        sourcePublication = publication;
      }

      // For each vault, create a copy of the publication using the RPC function
      for (const vaultIdToAdd of vaultIds) {
        // Check if publication is already in this vault (as a copy)
        const { data: existingCopy, error: checkError } = await supabase
          .from('vault_publications')
          .select('*')
          .eq('vault_id', vaultIdToAdd)
          .or(`original_publication_id.eq.${sourcePublicationId},id.eq.${publicationId}`)
          .maybeSingle();

        if (checkError) throw checkError;

        // Only add if not already in vault as a copy
        if (!existingCopy) {
          // If we have a vault_publication, we need to copy its data directly
          if (vaultPub) {
            // Copy the vault_publication data to the new vault
            const { id, vault_id, original_publication_id, created_at, updated_at, ...pubData } = vaultPub;
            const { error: insertError } = await supabase
              .from('vault_publications')
              .insert({
                ...pubData,
                vault_id: vaultIdToAdd,
                original_publication_id: original_publication_id || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });

            if (insertError) throw insertError;
          } else {
            // Use the RPC function for original publications
            const { error: insertError } = await supabase.rpc('copy_publication_to_vault', {
              pub_id: sourcePublicationId,
              target_vault_id: vaultIdToAdd,
              user_id: user.id
            });

            if (insertError) throw insertError;
          }
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
    if (!deleteConfirmation || !vaultId || !canEdit) {
      logger.debug('[handleDeletePublication] Early return - missing required data', { 
        hasDeleteConfirmation: !!deleteConfirmation, 
        vaultId, 
        canEdit 
      });
      return;
    }

    const deletedId = deleteConfirmation.id;
    logger.debug('[handleDeletePublication] Starting delete', { deletedId, vaultId });

    try {
      // Determine if this is a vault-specific copy or an original publication
      // First check if the ID exists in vault_publications
      const { data: vaultPub, error: vaultPubError } = await supabase
        .from('vault_publications')
        .select('id, original_publication_id, vault_id')
        .eq('id', deletedId)
        .maybeSingle();

      logger.debug('[handleDeletePublication] vault_publications lookup', { 
        vaultPub, 
        vaultPubError,
        lookupVaultId: vaultPub?.vault_id,
        currentVaultId: vaultId
      });

      let deleteError;
      let deletedCount = 0;

      if (vaultPub) {
        // This is a vault-specific copy, delete from vault_publications
        // Also ensure it belongs to the current vault
        logger.debug('[handleDeletePublication] Deleting from vault_publications', { 
          deletedId, 
          vaultId,
          matchesVault: vaultPub.vault_id === vaultId
        });
        
        const { error, count } = await supabase
          .from('vault_publications')
          .delete({ count: 'exact' })
          .eq('id', deletedId)
          .eq('vault_id', vaultId);

        deleteError = error;
        deletedCount = count ?? 0;
        
        logger.debug('[handleDeletePublication] Delete result', { deleteError, deletedCount });
      } else {
        // This might be an original publication ID, try to delete from publications
        logger.debug('[handleDeletePublication] Trying publications table', { deletedId });
        
        const { error, count } = await supabase
          .from('publications')
          .delete({ count: 'exact' })
          .eq('id', deletedId);

        deleteError = error;
        deletedCount = count ?? 0;
        
        logger.debug('[handleDeletePublication] Publications delete result', { deleteError, deletedCount });
      }

      if (deleteError) {
        // Check if it's a permission error
        if (deleteError.code === '42501' || deleteError.message?.includes('permission')) {
          toast({
            title: 'permission_denied',
            description: 'You do not have permission to delete this paper.',
            variant: 'destructive',
          });
          return;
        }
        throw deleteError;
      }

      // Check if any rows were actually deleted (RLS might silently prevent deletion)
      if (deletedCount === 0) {
        toast({
          title: 'Could not delete paper',
          description: 'The paper could not be deleted. You may not have permission.',
          variant: 'destructive',
        });
        return;
      }

      // Optimistic update
      setPublications(prev => prev.filter(p => p.id !== deletedId));
      setPublicationTags(prev => prev.filter(pt => pt.publication_id !== deletedId));

      // Update last activity for the deleted publication
      updateLastActivity('publication_removed', user?.id || null);

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

      // Delete vault publications (annotated copies)
      // This will cascade delete publication_tags due to ON DELETE CASCADE
      await supabase
        .from('vault_publications')
        .delete()
        .eq('vault_id', deletedId);

      // Delete vault shares
      await supabase
        .from('vault_shares')
        .delete()
        .eq('vault_id', deletedId);

      // Delete vault favorites
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

    const result = await sharedVaultOps.updateTag(tagId, updates);
    if (result.success && result.tag) {
      toast({
        title: 'tag_updated ✨',
        description: `Tag renamed to "${result.tag.name}"`,
      });
      return result.tag;
    }
    return null;
  };

  const handleDeleteTag = async (tagId: string): Promise<{ success: boolean; error?: Error }> => {
    if (!user || !canEdit) {
      return { success: false, error: new Error('Not authorized to delete tags') };
    }

    const result = await sharedVaultOps.deleteTag(tagId);
    if (result.success) {
      toast({
        title: 'tag_deleted 🗑️',
        description: 'Tag removed from vault',
      });
    }
    return result;
  };

  const handleFavorite = async () => {
    if (!user || !currentVault) return;

    const wasFavorited = isFavorite(currentVault.id);
    const success = await toggleFavorite(currentVault.id);
    if (success) {
      // Update count immediately
      setFavoritesCount(prev => wasFavorited ? Math.max(0, prev - 1) : prev + 1);
      toast({
        title: wasFavorited ? 'removed_from_favorites' : 'added_to_favorites ❤️',
      });
    }
  };

  const handleFork = async () => {
    if (!user || !currentVault) {
      toast({
        title: 'sign_in_required',
        description: 'Please sign in to fork this vault.',
        variant: 'destructive',
      });
      return;
    }

    if (forking) return; // Prevent double-clicks
    
    setForking(true);
    try {
      const newVault = await forkVault(currentVault);

      if (newVault) {
        toast({
          title: 'vault_forked 🍴',
          description: 'Successfully forked vault!',
        });
        navigate(`/vault/${newVault.id}`);
      }
    } finally {
      setForking(false);
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

        // Update the editingVault state with the fresh data from the database
        setEditingVault(updatedVault as Vault);
        
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

      // Note: Don't set editingVault to null here, let the dialog stay open with updated data
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
  const [hasStartedInitialLoad, setHasStartedInitialLoad] = useState(false);
  const [finishedInitialLoad, setFinishedInitialLoad] = useState(false);

  // Track loading state changes to prevent flickering
  useEffect(() => {
    const isLoading = accessStatus === 'loading' || authLoading || contentLoading;
    console.log('[VaultDetail] Loading state changed:', {
      accessStatus,
      authLoading,
      contentLoading,
      isLoading,
      hasStartedInitialLoad,
      finishedInitialLoad,
      timestamp: Date.now()
    });

    if (!hasStartedInitialLoad && (accessStatus === 'loading' || authLoading || contentLoading)) {
      // Mark when initial loading starts
      console.log('[VaultDetail] Initial loading started');
      setHasStartedInitialLoad(true);
    }

    if (hasStartedInitialLoad && !isLoading && !finishedInitialLoad) {
      // Mark when initial loading is complete
      console.log('[VaultDetail] Initial loading completed');
      setFinishedInitialLoad(true);
    }
  }, [accessStatus, authLoading, contentLoading, hasStartedInitialLoad, finishedInitialLoad]);


  // Determine if we should show the loading screen
  // Only show loading screen during initial load, not after initial load is complete
  const shouldShowLoading = hasStartedInitialLoad && !finishedInitialLoad;

  console.log('[VaultDetail] Render - shouldShowLoading:', shouldShowLoading, {
    hasStartedInitialLoad,
    finishedInitialLoad,
    timestamp: Date.now()
  });

  // Show loading state while access is being checked and content is loading
  // Only show "not found" after access check is complete and confirmed inaccessible
  if (shouldShowLoading || accessStatus === 'loading') {
    return (
      <PhaseLoader
        phases={loadingPhases}
        title="opening_vault"
        subtitle={vault?.name || 'accessing your research collection'}
      />
    );
  }

  // Only show access-related screens after access check is fully complete
  // This prevents flickering between states
  
  // Check if vault exists but access is denied/requestable
  // Only show "not found" after access check is complete and confirmed inaccessible
  const isVaultAccessible = vault || accessStatus === 'requestable' || accessStatus === 'pending';

  if (!isVaultAccessible && accessStatus === 'denied' && finishedInitialLoad) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8 max-w-md mx-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto shadow-lg">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2 font-mono">vault_not_found</h1>
            <p className="text-muted-foreground font-mono text-sm mb-4">
              // this_vault_doesnt_exist_or_was_removed
            </p>
            <Button
              onClick={() => navigate(user ? '/dashboard' : '/')}
              className="font-mono"
            >
              {user ? 'back_to_dashboard' : 'back_to_home'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show pending access request status (only after loading complete)
  if (accessStatus === 'pending' && finishedInitialLoad) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8 max-w-md mx-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center mx-auto border-2 border-yellow-500/30">
            <Clock className="w-10 h-10 text-yellow-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2 font-mono">request_pending</h1>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4">
              <p className="font-mono text-sm text-yellow-600 dark:text-yellow-400">
                <span className="text-yellow-500 font-semibold">warn:</span> your access request is pending approval
              </p>
            </div>
            <p className="text-muted-foreground text-sm mb-6">
              the vault owner has been notified. you'll get access once they approve your request.
            </p>
            <Button
              variant="outline"
              onClick={() => navigate(user ? '/dashboard' : '/')}
              className="font-mono"
            >
              {user ? 'back_to_dashboard' : 'back_to_home'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // If user doesn't have access to a protected vault, show access request page (only after loading complete)
  if (accessStatus === 'requestable' && vault && finishedInitialLoad) {

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8 max-w-md mx-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center mx-auto border-2 border-orange-500/30">
            <Shield className="w-10 h-10 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2 font-mono">{vault.name}</h1>
            {vault.description && (
              <p className="text-muted-foreground font-mono text-sm mb-2">
                // {vault.description.toLowerCase()}
              </p>
            )}
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 mb-6">
              <p className="font-mono text-sm text-orange-600 dark:text-orange-400">
                <span className="text-orange-500 font-semibold">info:</span> this vault is protected. request access to view its contents.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                onClick={async () => {
                  if (!user) {
                    // Store URL and redirect to auth
                    localStorage.setItem('redirectAfterLogin', `/vault/${vaultId}`);
                    navigate('/auth');
                    return;
                  }

                  try {
                    // Check for existing request
                    const { data: existingRequest } = await supabase
                      .from('vault_access_requests')
                      .select('id, status')
                      .eq('vault_id', vault.id)
                      .eq('requester_id', user.id)
                      .in('status', ['pending', 'approved'])
                      .maybeSingle();

                    if (existingRequest?.status === 'pending') {
                      toast({
                        title: "Request Already Pending",
                        description: "Your access request is pending approval.",
                      });
                      return;
                    } else if (existingRequest?.status === 'approved') {
                      toast({
                        title: "Access Approved",
                        description: "Refreshing...",
                      });
                      refresh();
                      return;
                    }

                    // Submit new request
                    const result = await requestVaultAccess(vault.id, user.id, '');
                    if (result.error) throw result.error;

                    toast({
                      title: "Request Submitted",
                      description: "The vault owner has been notified.",
                    });
                    refresh();
                  } catch (error) {
                    console.error('[VaultDetail] Error requesting access:', error);
                    toast({
                      title: "Error",
                      description: (error as Error).message,
                      variant: "destructive",
                    });
                  }
                }}
                disabled={hasPendingRequest}
                className={`w-full font-mono ${hasPendingRequest ? 'bg-muted text-muted-foreground' : 'bg-gradient-primary text-white shadow-lg hover:shadow-xl'} transition-all`}
              >
                {!user ? 'sign_in_to_request_access' : hasPendingRequest ? 'request_pending' : 'request_access'}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(user ? '/dashboard' : '/')}
                className="w-full font-mono"
              >
                {user ? 'back_to_dashboard' : 'back_to_home'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // At this point, we should have canView === true and a vault to display
  if (!canView || !vault) {
    // Fallback - this shouldn't happen but just in case
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <Lock className="w-12 h-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground font-mono">access_denied</p>
          <Button variant="outline" onClick={() => navigate(user ? '/dashboard' : '/')}>
            {user ? 'back_to_dashboard' : 'back_to_home'}
          </Button>
        </div>
      </div>
    );
  }

  // Determine vault visibility badge
  const visibilityBadge = (() => {
    switch (vault.visibility) {
      case 'public':
        return <Badge variant="secondary" className="font-mono text-xs gap-1 shrink-0"><Globe className="w-3 h-3" /> public</Badge>;
      case 'protected':
        return <Badge variant="secondary" className="font-mono text-xs gap-1 shrink-0"><Shield className="w-3 h-3" /> protected</Badge>;
      case 'private':
        return <Badge variant="secondary" className="font-mono text-xs gap-1 shrink-0"><Lock className="w-3 h-3" /> private</Badge>;
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
        <div className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-30">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                {visibilityBadge}
                {userRole === 'owner' && (
                  <Badge variant="outline" className="font-mono text-xs gap-1 shrink-0">
                    <Crown className="w-3 h-3" />
                    owner
                  </Badge>
                )}
                {userRole === 'editor' && (
                  <Badge variant="outline" className="font-mono text-xs gap-1 shrink-0">
                    <Edit className="w-3 h-3" />
                    editor
                  </Badge>
                )}
                {userRole === 'viewer' && (
                  <Badge variant="outline" className="font-mono text-xs gap-1 shrink-0">
                    <Eye className="w-3 h-3" />
                    viewer
                  </Badge>
                )}
                <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {lastActivity 
                      ? `${lastActivity.userName || 'someone'}.last_update() // ${formatTimeAgo(lastActivity.timestamp)}`
                      : currentVault?.updated_at 
                        ? `last_sync() // ${formatTimeAgo(new Date(currentVault.updated_at))}`
                        : 'last_sync() // unknown'
                    }
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Stats for owners */}
                {isOwner && currentVault && (
                  <>
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground font-mono border border-input rounded-md px-3 h-8">
                      <Heart className="w-3.5 h-3.5" />
                      <span>{favoritesCount}</span>
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground font-mono border border-input rounded-md px-3 h-8">
                      <GitFork className="w-3.5 h-3.5" />
                      <span>{forkCount}</span>
                    </div>
                  </>
                )}

                {/* Fork and Favorite buttons for non-owners (viewers and editors) */}
                {!isOwner && currentVault && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFavorite}
                      className={`font-mono h-8 ${isFavorite(currentVault.id) ? 'text-rose-500 border-rose-500/30' : ''}`}
                      title={isFavorite(currentVault.id) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Heart className={`w-4 h-4 ${isFavorite(currentVault.id) ? 'fill-rose-500' : ''}`} />
                      <span className="ml-2 hidden md:inline">{isFavorite(currentVault.id) ? 'favorited' : 'favorite'}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFork}
                      disabled={forking}
                      className="font-mono h-8"
                      title="Fork vault"
                    >
                      <GitFork className="w-4 h-4" />
                      <span className="ml-2 hidden md:inline">fork</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <PublicationList
          publications={publications}
          tags={tags}
          vaults={vaults.concat(sharedVaults)}
          vaultOwnerName={!isOwner && vaultOwner ? (vaultOwner.display_name || vaultOwner.username || undefined) : undefined}
          publicationTagsMap={publicationTagsMap}
          publicationVaultsMap={publicationVaultsMap}
          relationsCountMap={relationsCountMap}
          selectedVault={currentVault}
          isVaultContext={true}
          onAddPublication={canEdit ? () => {
            setEditingPublication(null);
            setIsPublicationDialogOpen(true);
          } : undefined}
          onImportPublications={canEdit ? () => setIsImportDialogOpen(true) : undefined}
          onEditPublication={canEdit ? (pub) => {
            setEditingPublication(pub);
            currentlyEditingPublicationId.current = pub.id;
            setIsPublicationDialogOpen(true);
          } : undefined}
          onDeletePublication={canEdit ? (pub) => setDeleteConfirmation(pub) : undefined}
          onExportBibtex={handleExportBibtex}
          onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
          onOpenGraph={() => setIsGraphOpen(true)}
          onEditVault={isOwner && currentVault ? () => {
            setEditingVault(vault);
            setIsVaultDialogOpen(true);
          } : undefined}
          onVaultUpdate={refetchVault}
          canEditTags={canEdit}
          onUpdateTag={canEdit ? handleUpdateTag : undefined}
          onDeleteTag={canEdit ? handleDeleteTag : undefined}
        />
      </div>

      <PublicationDialog
        open={isPublicationDialogOpen}
        onOpenChange={(open) => {
          setIsPublicationDialogOpen(open);
          if (!open) {
            setEditingPublication(null);
            currentlyEditingPublicationId.current = null;
            refetchRelations();
          }
        }}
        publication={editingPublication}
        vaults={vaults.concat(sharedVaults)} // Pass all user's vaults and shared vaults
        tags={tags}
        publicationTags={editingPublication ? publicationTagsMap[editingPublication.id] || [] : []}
        allPublications={allPublications} // Use all publications to show in which vaults this publication exists
        publicationVaults={editingPublication ? publicationVaultsMap[editingPublication.id] || [] : []} // Show which vaults this publication is already in
        currentVaultId={vaultId} // Pass current vault ID to pre-select when adding new paper
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
        key={editingVault ? `${editingVault.id}-${editingVault.updated_at}` : 'new-vault'}
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

      <AlertDialog open={!!deleteConfirmation} onOpenChange={() => setDeleteConfirmation(null)}>
        <AlertDialogContent className="border-2 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold font-mono">remove_from_vault?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-sm">
              // this_will_remove "{deleteConfirmation?.title}" from this vault
              <br />
              // the original paper will remain in your all_papers collection
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePublication} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono">
              remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteVaultConfirmation} onOpenChange={() => setDeleteVaultConfirmation(null)}>
        <AlertDialogContent className="border-2 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold font-mono text-destructive">⚠️ delete_vault?</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="px-6 pb-4">
            <div className="font-mono text-sm space-y-3">
              <p className="text-foreground">
                // vault: <span className="font-bold text-destructive">"{deleteVaultConfirmation?.name}"</span>
              </p>
              <p className="text-muted-foreground">
                // this_will_permanently_delete:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                <li>all annotated publications in this vault</li>
                <li>all tags and relationships</li>
                <li>all vault settings and metadata</li>
              </ul>
              <p className="text-muted-foreground">
                // original papers remain in all_papers collection
              </p>
              <p className="text-destructive font-bold mt-3">
                ⚡ this_action_is_irreversible
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVault} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono">
              delete_vault
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}