import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { PhaseLoader, LoadingPhase } from '@/components/ui/loading';
import { useToast } from '@/hooks/use-toast';
import { Sparkles } from 'lucide-react';
import { getPageCache, setPageCache, hasPageCache } from '@/lib/pageCache';
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

// Cache structure for Dashboard data
interface DashboardCache {
  publications: Publication[];
  vaults: Vault[];
  sharedVaults: Vault[];
  tags: Tag[];
  publicationTags: PublicationTag[];
  publicationRelations: PublicationRelation[];
  publicationVaultsMap: Record<string, string[]>;
  publicationTagsMap: Record<string, string[]>;
  relationsCountMap: Record<string, number>;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, refetch: refetchProfile } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Check if we have cached data to determine if this is a "return visit"
  const hasCachedData = useRef(user ? hasPageCache('dashboard') : false);

  const [publications, setPublications] = useState<Publication[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [vaultPapers, setVaultPapers] = useState<{[key: string]: string[]}>({});
  const [tags, setTags] = useState<Tag[]>([]);
  const [publicationTags, setPublicationTags] = useState<PublicationTag[]>([]);
  const [publicationRelations, setPublicationRelations] = useState<PublicationRelation[]>([]);
  const [publicationVaultsMap, setPublicationVaultsMap] = useState<Record<string, string[]>>({});
  const [publicationTagsMap, setPublicationTagsMap] = useState<Record<string, string[]>>({});
  const [relationsCountMap, setRelationsCountMap] = useState<Record<string, number>>({});
  const [sharedVaults, setSharedVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  // Only show loader if we don't have cached data (true first visit)
  const [showLoader, setShowLoader] = useState(!hasCachedData.current);
  const [loaderProgress, setLoaderProgress] = useState(0); // Track fake progress
  const [loaderComplete, setLoaderComplete] = useState(false); // Track when ready to hide

  // Loading phases for the phase loader
  const [loadingPhases, setLoadingPhases] = useState<LoadingPhase[]>([
    { id: 'auth', label: 'authenticating_user', status: 'loading' },
    { id: 'profile', label: 'loading_profile', status: 'pending' },
    { id: 'vaults', label: 'fetching_vaults', status: 'pending' },
    { id: 'publications', label: 'indexing_publications', status: 'pending' },
    { id: 'tags', label: 'syncing_tags', status: 'pending' },
    { id: 'relations', label: 'mapping_relations', status: 'pending' },
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

  // Track auth loading phase
  useEffect(() => {
    if (!authLoading && user) {
      updatePhase('auth', 'complete');
    }
  }, [authLoading, user, updatePhase]);

  // Track profile loading phase - complete when loading finishes (profile may be null for new users)
  useEffect(() => {
    if (!profileLoading) {
      updatePhase('profile', 'complete');
    }
  }, [profileLoading, updatePhase]);

  // Smooth progress animation - fake progress that accelerates based on actual phase completion
  useEffect(() => {
    if (!showLoader) return;

    const completedCount = loadingPhases.filter(p => p.status === 'complete').length;
    const totalPhases = loadingPhases.length;
    const actualProgress = (completedCount / totalPhases) * 100;
    
    // Use requestAnimationFrame for smoother updates
    let animationId: number;
    let lastTime = performance.now();
    
    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      
      // Only update every ~50ms for smooth but not excessive updates
      if (deltaTime >= 50) {
        lastTime = currentTime;
        
        setLoaderProgress(prev => {
          // If all phases complete, rush to 100%
          if (completedCount === totalPhases) {
            const newProgress = Math.min(prev + 5, 100);
            if (newProgress >= 100) {
              setLoaderComplete(true);
            }
            return Math.round(newProgress);
          }
          
          // Otherwise, progress smoothly
          // Calculate how far we should be based on actual progress + buffer
          const targetProgress = Math.min(actualProgress + 15, 95);
          
          if (prev >= targetProgress) {
            return prev; // Don't go backwards or exceed target
          }
          
          // Smooth easing - faster when far from target, slower when close
          const distance = targetProgress - prev;
          const increment = Math.max(0.5, distance * 0.1);
          
          return Math.round(Math.min(prev + increment, targetProgress));
        });
      }
      
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, [showLoader, loadingPhases]);

  // Hide loader after progress reaches 100% and shows completion briefly
  useEffect(() => {
    if (loaderComplete && loaderProgress >= 100) {
      const timer = setTimeout(() => {
        setShowLoader(false);
      }, 600); // Show completion state briefly
      return () => clearTimeout(timer);
    }
  }, [loaderComplete, loaderProgress]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/'); // Redirect to root page instead of auth page
    }
  }, [user, authLoading, navigate]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    if (isInitialLoad) {
      setLoading(true);
    }
    try {
      // Start vaults phase
      updatePhase('vaults', 'loading');

      // Fetch owned vaults, shared vaults, and other data
      const [pubsRes, ownedVaultsRes, sharedVaultsRes, vaultPubsRes, tagsRes, pubTagsRes, relationsRes] = await Promise.all([
        supabase.from('publications').select('*').order('created_at', { ascending: false }),
        supabase.from('vaults').select('*').eq('user_id', user.id).order('name'),
        // Fetch vaults shared with current user (via email or user_id)
        supabase
          .from('vault_shares')
          .select('vault_id')
          .or(`shared_with_email.eq.${user.email},shared_with_user_id.eq.${user.id}`),
        supabase.from('vault_publications').select('*').order('created_at', { ascending: false }),
        supabase.from('tags').select('*').order('name'),
        supabase.from('publication_tags').select('*'),
        supabase.from('publication_relations').select('*'),
      ]);

      // Complete vaults phase
      if (ownedVaultsRes.data) setVaults(ownedVaultsRes.data as Vault[]);
      updatePhase('vaults', 'complete');

      // Combine original publications with vault-specific copies
      // For the dashboard, we want to show all publications the user has access to
      const originalPublications = pubsRes.data as Publication[];
      const vaultPublications = vaultPubsRes.data as any[];

      // Convert vault publications to the same format as original publications
      const formattedVaultPublications = vaultPublications.map(vp => ({
        id: vp.id, // Use the vault publication ID
        user_id: vp.created_by, // Use the creator of the vault copy
        title: vp.title,
        authors: vp.authors,
        year: vp.year,
        journal: vp.journal,
        volume: vp.volume,
        issue: vp.issue,
        pages: vp.pages,
        doi: vp.doi,
        url: vp.url,
        abstract: vp.abstract,
        pdf_url: vp.pdf_url,
        bibtex_key: vp.bibtex_key,
        publication_type: vp.publication_type,
        notes: vp.notes,
        booktitle: vp.booktitle,
        chapter: vp.chapter,
        edition: vp.edition,
        editor: vp.editor,
        howpublished: vp.howpublished,
        institution: vp.institution,
        number: vp.number,
        organization: vp.organization,
        publisher: vp.publisher,
        school: vp.school,
        series: vp.series,
        type: vp.type,
        eid: vp.eid,
        isbn: vp.isbn,
        issn: vp.issn,
        keywords: vp.keywords,
        created_at: vp.created_at,
        updated_at: vp.updated_at,
        original_publication_id: vp.original_publication_id, // Keep track of the original
      }));

      // Combine publications - deduplicating by original publication ID and aggregating vault info
      const allPublicationsMap: Record<string, Publication> = {};

      // Add original publications first
      originalPublications.forEach(pub => {
        allPublicationsMap[pub.id] = pub;
      });

      // Process vault-specific copies and aggregate their information
      // For the main publication list, we want to avoid duplicates
      // So we'll only add vault-specific copies if they don't have an original counterpart
      formattedVaultPublications.forEach(vp => {
        // If this is a copy of an original publication, we don't add it separately
        // to avoid duplication. The vault association will be tracked in publicationVaultsMap.
        if (vp.original_publication_id) {
          // We don't add this to allPublicationsMap to avoid duplication
          // The original publication will represent this in the UI
        } else {
          // If no original ID, treat as standalone (this shouldn't normally happen)
          if (!allPublicationsMap[vp.id]) {
            allPublicationsMap[vp.id] = vp;
          }
        }
      });

      const allPublications = Object.values(allPublicationsMap);

      if (ownedVaultsRes.data) setVaults(ownedVaultsRes.data as Vault[]);
      if (sharedVaultsRes.data) {
        // Process shared vaults
        if (sharedVaultsRes.data.length > 0) {
          const sharedVaultIds = sharedVaultsRes.data.map(s => s.vault_id);
          const { data: sharedVaultDetails } = await supabase
            .from('vaults')
            .select('*')
            .in('id', sharedVaultIds);

          if (sharedVaultDetails) {
            setSharedVaults(sharedVaultDetails as Vault[]);
          }
        }
      }
      setPublications(allPublications);
      if (tagsRes.data) setTags(tagsRes.data as Tag[]);
      if (pubTagsRes.data) setPublicationTags(pubTagsRes.data as PublicationTag[]);
      if (relationsRes.data) setPublicationRelations(relationsRes.data as PublicationRelation[]);

      // Create publicationVaultsMap to track which vaults each publication belongs to
      const newPublicationVaultsMap: Record<string, string[]> = {};

      // Initialize original publications with empty arrays
      originalPublications.forEach(pub => {
        newPublicationVaultsMap[pub.id] = [];
      });

      // Map vault-specific copies to track which vaults each original publication belongs to
      vaultPublications.forEach(vp => {
        // Map the original publication to the vault it's in
        if (vp.original_publication_id) {
          if (!newPublicationVaultsMap[vp.original_publication_id]) {
            newPublicationVaultsMap[vp.original_publication_id] = [];
          }
          if (!newPublicationVaultsMap[vp.original_publication_id].includes(vp.vault_id)) {
            newPublicationVaultsMap[vp.original_publication_id].push(vp.vault_id);
          }
        }

        // Also track vault-specific copies (for when viewing individual vaults)
        if (!newPublicationVaultsMap[vp.id]) {
          newPublicationVaultsMap[vp.id] = [];
        }
        newPublicationVaultsMap[vp.id].push(vp.vault_id);
      });

      setPublicationVaultsMap(newPublicationVaultsMap);

      // Create publication tags map considering both original and vault-specific publications
      const publicationTagsMap: Record<string, string[]> = {};

      // Create a mapping from both publication_id and vault_publication_id to tags
      const pubTagsMap: Record<string, string[]> = {};
      const vaultPubTagsMap: Record<string, string[]> = {};

      publicationTags.forEach((pt) => {
        // Map by publication_id (for original publications)
        if (pt.publication_id) {
          if (!pubTagsMap[pt.publication_id]) pubTagsMap[pt.publication_id] = [];
          pubTagsMap[pt.publication_id].push(pt.tag_id);
        }

        // Map by vault_publication_id (for vault-specific copies)
        if (pt.vault_publication_id) {
          if (!vaultPubTagsMap[pt.vault_publication_id]) vaultPubTagsMap[pt.vault_publication_id] = [];
          vaultPubTagsMap[pt.vault_publication_id].push(pt.tag_id);
        }
      });

      // Create a mapping of original publication IDs to all their tags across all vaults
      const originalPubTagsMap: Record<string, string[]> = {};

      // Initialize the map with original publication tags
      Object.entries(pubTagsMap).forEach(([pubId, tags]) => {
        originalPubTagsMap[pubId] = [...tags];
      });

      // Add tags from vault-specific copies to the original publication
      publicationTags.forEach(pt => {
        if (pt.vault_publication_id) {
          // Find the vault publication to get its original publication ID
          const vaultPub = vaultPublications.find(vp => vp.id === pt.vault_publication_id);
          if (vaultPub && vaultPub.original_publication_id) {
            // Add this tag to the original publication's tag list
            if (!originalPubTagsMap[vaultPub.original_publication_id]) {
              originalPubTagsMap[vaultPub.original_publication_id] = [];
            }
            originalPubTagsMap[vaultPub.original_publication_id].push(pt.tag_id);
          }
        }
      });

      // Now assign the aggregated tags to each publication in the deduplicated list
      allPublications.forEach(pub => {
        const originalId = pub.original_publication_id || pub.id;
        // Use Set to remove duplicates
        publicationTagsMap[pub.id] = [...new Set(originalPubTagsMap[originalId] || [])];
      });

      // Build relations count map (bidirectional)
      // In the copy-based model, we need to map relations to vault publication IDs
      const relationsCountMap: Record<string, number> = {};
      publicationRelations.forEach((rel) => {
        // Map original publication IDs to vault publication IDs
        // First try to find by original_publication_id, then by id
        const pub1 = allPublications.find(p => p.original_publication_id === rel.publication_id || p.id === rel.publication_id);
        const pub2 = allPublications.find(p => p.original_publication_id === rel.related_publication_id || p.id === rel.related_publication_id);

        const vaultPubId1 = pub1?.id || rel.publication_id;
        const vaultPubId2 = pub2?.id || rel.related_publication_id;

        relationsCountMap[vaultPubId1] = (relationsCountMap[vaultPubId1] || 0) + 1;
        relationsCountMap[vaultPubId2] = (relationsCountMap[vaultPubId2] || 0) + 1;
      });

      // Complete publications phase after all processing
      updatePhase('publications', 'complete');

      // Complete tags phase
      updatePhase('tags', 'complete');

      // Set the state with the processed data
      setPublications(allPublications);
      if (tagsRes.data) setTags(tagsRes.data as Tag[]);
      if (pubTagsRes.data) setPublicationTags(pubTagsRes.data as PublicationTag[]);
      if (relationsRes.data) setPublicationRelations(relationsRes.data as PublicationRelation[]);

      // Complete relations phase
      updatePhase('relations', 'complete');

      // Set the computed maps
      setPublicationTagsMap(publicationTagsMap);
      setRelationsCountMap(relationsCountMap);

      // Fetch shared vault details
      let processedSharedVaults: Vault[] = [];
      if (sharedVaultsRes.data && sharedVaultsRes.data.length > 0) {
        const sharedVaultIds = sharedVaultsRes.data.map(s => s.vault_id);
        const { data: sharedVaultDetails } = await supabase
          .from('vaults')
          .select('*')
          .in('id', sharedVaultIds)

        if (sharedVaultDetails) {
          processedSharedVaults = sharedVaultDetails as Vault[];
          setSharedVaults(processedSharedVaults);
        }
      } else {
        setSharedVaults([]);
      }
      
      // Save to cache for future visits
      setPageCache<DashboardCache>('dashboard', {
        publications: allPublications,
        vaults: ownedVaultsRes.data as Vault[] || [],
        sharedVaults: processedSharedVaults,
        tags: tagsRes.data as Tag[] || [],
        publicationTags: pubTagsRes.data as PublicationTag[] || [],
        publicationRelations: relationsRes.data as PublicationRelation[] || [],
        publicationVaultsMap: newPublicationVaultsMap,
        publicationTagsMap,
        relationsCountMap,
      }, user?.id);
      
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
  }, [user, isInitialLoad, updatePhase]);

  // Restore from cache on mount if available (for instant navigation)
  useEffect(() => {
    if (user) {
      const cached = getPageCache<DashboardCache>('dashboard', user.id);
      if (cached) {
        // Restore cached data immediately - no loading screen needed
        setPublications(cached.publications);
        setVaults(cached.vaults);
        setSharedVaults(cached.sharedVaults);
        setTags(cached.tags);
        setPublicationTags(cached.publicationTags);
        setPublicationRelations(cached.publicationRelations);
        setPublicationVaultsMap(cached.publicationVaultsMap);
        setPublicationTagsMap(cached.publicationTagsMap);
        setRelationsCountMap(cached.relationsCountMap);
        setLoading(false);
        setIsInitialLoad(false);
        // Skip loader animation for cached data
        setLoaderComplete(true);
        setLoaderProgress(100);
      }
      // Always fetch fresh data (will update silently if we have cache)
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

  // The publicationTagsMap and relationsCountMap are now created inside the fetchData function
  // to ensure proper access to all required data and avoid duplication issues
  // These will be passed to the PublicationList component via state

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
        // Determine if this is a vault-specific copy or an original publication
        // Check if the ID matches a vault_publications record
        const { data: vaultPub, error: vaultPubError } = await supabase
          .from('vault_publications')
          .select('id, original_publication_id')
          .eq('id', editingPublication.id)
          .maybeSingle(); // Use maybeSingle to not throw error if not found

        let updatedPub;
        let updateError;

        if (vaultPub) {
          // This is a vault-specific copy, update the vault_publications table
          const dataToSave = {
            ...data,
            bibtex_key: data.bibtex_key || generateBibtexKey({ ...editingPublication, ...data } as Publication),
            updated_at: new Date().toISOString()
          };

          const result = await supabase
            .from('vault_publications')
            .update(dataToSave)
            .eq('id', editingPublication.id)
            .select()
            .single();

          updatedPub = result.data;
          updateError = result.error;
        } else {
          // This is an original publication, update the publications table
          const dataToSave = {
            ...data,
            bibtex_key: data.bibtex_key || generateBibtexKey({ ...editingPublication, ...data } as Publication)
          };

          const result = await supabase
            .from('publications')
            .update(dataToSave)
            .eq('id', editingPublication.id)
            .select()
            .single();

          updatedPub = result.data;
          updateError = result.error;
        }

        if (updateError) throw updateError;

        // Update tags - use the original publication ID for tagging
        // Check if this is a vault-specific copy and get the original publication ID
        console.log('Updating tags for publication in Dashboard:', editingPublication.id, 'with tagIds:', tagIds);

        let originalPublicationId = editingPublication.id;

        if (editingPublication.original_publication_id) {
          // If the publication object already has the original ID, use it
          originalPublicationId = editingPublication.original_publication_id;
        } else {
          // Otherwise, check if it's a vault-specific copy by querying vault_publications
          const { data: vaultPubRecord, error: vaultPubError } = await supabase
            .from('vault_publications')
            .select('original_publication_id')
            .eq('id', editingPublication.id)
            .maybeSingle();

          if (vaultPubRecord?.original_publication_id) {
            originalPublicationId = vaultPubRecord.original_publication_id;
          }
        }

        console.log('Original publication ID in Dashboard:', originalPublicationId);

        // In the Dashboard (personal context), continue using publication_id
        // First, get existing tag associations to compare
        // For vault-specific copies, use vault_publication_id; for original publications, use publication_id
        let query;
        if (editingPublication.original_publication_id) {
          // This is a vault-specific copy - use vault_publication_id
          query = supabase
            .from('publication_tags')
            .select('tag_id')
            .eq('vault_publication_id', editingPublication.id);
        } else {
          // This is an original publication - use publication_id
          query = supabase
            .from('publication_tags')
            .select('tag_id')
            .eq('publication_id', originalPublicationId);
        }

        const { data: existingTags, error: fetchError } = await query;

        if (fetchError) {
          console.error('Error fetching existing tags in Dashboard:', fetchError);
          throw fetchError;
        }

        const existingTagIds = existingTags?.map(tag => tag.tag_id) || [];

        // Determine which tags to remove (exist but not in new selection)
        const tagsToRemove = existingTagIds.filter(existingId => !tagIds.includes(existingId));

        // Delete tags that are no longer selected
        if (tagsToRemove.length > 0) {
          const { error: deleteError } = await supabase
            .from('publication_tags')
            .delete()
            // For vault-specific copies, use vault_publication_id; for original publications, use publication_id
            .eq(editingPublication.original_publication_id ? 'vault_publication_id' : 'publication_id',
                editingPublication.original_publication_id ? editingPublication.id : originalPublicationId)
            .in('tag_id', tagsToRemove);

          if (deleteError) {
            console.error('Error deleting existing tags in Dashboard:', deleteError);
            throw deleteError;
          }
        }

        // Determine which tags to add (in new selection but don't exist yet)
        const tagsToAdd = tagIds.filter(newId => !existingTagIds.includes(newId));

        if (tagsToAdd.length > 0) {
          console.log('Inserting new tag associations in Dashboard:', tagsToAdd);
          // For vault-specific copies, use vault_publication_id; for original publications, use publication_id
          let tagInsertData;
          if (editingPublication.original_publication_id) {
            // This is a vault-specific copy - use vault_publication_id
            tagInsertData = tagsToAdd.map((tagId) => ({
              publication_id: null, // Set to null for vault-specific copies
              vault_publication_id: editingPublication.id,
              tag_id: tagId,
            }));
          } else {
            // This is an original publication - use publication_id
            tagInsertData = tagsToAdd.map((tagId) => ({
              publication_id: originalPublicationId,
              vault_publication_id: null, // Set to null for original publications
              tag_id: tagId,
            }));
          }

          const { error: insertError } = await supabase.from('publication_tags').insert(tagInsertData);

          if (insertError) {
            console.error('Error inserting new tags in Dashboard:', insertError);
            throw insertError;
          }
        } else {
          console.log('No new tags to insert in Dashboard');
        }

        // Optimistic update
        setPublications(prev => prev.map(p =>
          p.id === editingPublication.id ? { ...p, ...updatedPub } as Publication : p
        ));

        // For vault-specific copies, we use vault_publication_id; for original publications, we use publication_id
        let newTagRecords;
        if (editingPublication.original_publication_id) {
          // This is a vault-specific copy - use vault_publication_id
          newTagRecords = tagIds.map(tagId => ({ id: crypto.randomUUID(), vault_publication_id: editingPublication.id, tag_id: tagId }));
        } else {
          // This is an original publication - use publication_id
          newTagRecords = tagIds.map(tagId => ({ id: crypto.randomUUID(), publication_id: originalPublicationId, tag_id: tagId }));
        }

        setPublicationTags(prev => [
          ...prev.filter(pt => {
            // Filter out tags for this publication based on whether it's a vault copy or original
            if (editingPublication.original_publication_id) {
              return pt.vault_publication_id !== editingPublication.id;
            } else {
              return pt.publication_id !== originalPublicationId;
            }
          }),
          ...newTagRecords
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

  const handleBulkImport = async (publicationsToImport: Partial<Publication>[], targetVaultId?: string | null): Promise<string[]> => {
    if (!user) return [];

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

      // Optimistic update
      if (insertedPubs) {
        setPublications(prev => [...(insertedPubs as Publication[]), ...prev]);
        insertedIds.push(...insertedPubs.map(p => p.id));

        // If a target vault is specified, add the papers to that vault
        if (targetVaultId) {
          for (const pub of insertedPubs) {
            await supabase.rpc('copy_publication_to_vault', {
              pub_id: pub.id,
              target_vault_id: targetVaultId,
              user_id: user.id
            });
          }
        }
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
    if (!user) return;

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
      for (const vaultId of vaultIds) {
        // Check if publication is already in this vault (as a copy)
        const { data: existingCopy, error: checkError } = await supabase
          .from('vault_publications')
          .select('*')
          .eq('vault_id', vaultId)
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
                vault_id: vaultId,
                original_publication_id: original_publication_id || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });

            if (insertError) throw insertError;
          } else {
            // Use the RPC function for original publications
            const { error: insertError } = await supabase.rpc('copy_publication_to_vault', {
              pub_id: sourcePublicationId,
              target_vault_id: vaultId,
              user_id: user.id
            });

            if (insertError) throw insertError;
          }
        }
      }

      toast({ title: `added_to_${vaultIds.length}_vault${vaultIds.length > 1 ? 's' : ''} ✨` });

      // Refresh the data to reflect the changes
      await fetchData();
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
      // Determine if this is a vault-specific copy or an original publication
      const { data: vaultPub, error: vaultPubError } = await supabase
        .from('vault_publications')
        .select('id, original_publication_id')
        .eq('id', deletedId)
        .maybeSingle();

      let deleteError;
      let deletedCount = 0;

      if (vaultPub) {
        // This is a vault-specific copy, delete from vault_publications
        const { error, count } = await supabase
          .from('vault_publications')
          .delete({ count: 'exact' })
          .eq('id', deletedId);

        deleteError = error;
        deletedCount = count ?? 0;
      } else {
        // This is an original publication, delete from publications table
        const { error, count } = await supabase
          .from('publications')
          .delete({ count: 'exact' })
          .eq('id', deletedId);

        deleteError = error;
        deletedCount = count ?? 0;
      }

      if (deleteError) throw deleteError;

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

      // Optimistic update - remove vault from list
      setVaults(prev => prev.filter(v => v.id !== deletedId));

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
      // Check if a user-scoped tag with the same name already exists (where vault_id is NULL)
      const { data: existingTag, error: existingTagError } = await supabase
        .from('tags')
        .select('id')
        .eq('user_id', user.id)
        .is('vault_id', null) // User-scoped tags have vault_id as NULL
        .eq('name', name)
        .maybeSingle();

      if (existingTag) {
        toast({
          title: 'Tag already exists',
          description: `A tag with the name "${name}" already exists in your personal tags.`,
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
        .insert({ name, color, user_id: user.id, parent_id: parentId || null })
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
          description: `A tag with the name "${name}" already exists in your personal tags.`,
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
    if (!user) return null; // Only allow updating tags if user is authenticated

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
        // Create optimistic vault with temporary ID
        const tempId = `temp_${Date.now()}`;
        const optimisticVault: Vault = {
          id: tempId,
          user_id: user.id,
          name: data.name || '',
          description: data.description || null,
          color: data.color || '#3b82f6',
          slug: data.slug || null,
          visibility: data.visibility || 'private',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Apply optimistic update immediately
        setVaults(prev => [...prev, optimisticVault].sort((a, b) => a.name.localeCompare(b.name)));
        
        try {
          const { data: newVault, error } = await supabase
            .from('vaults')
            .insert([{ ...data, user_id: user.id } as Omit<Vault, 'id' | 'created_at' | 'updated_at'>])
            .select()
            .single();

          if (error) throw error;
          
          // Replace temporary vault with real one from database
          if (newVault) {
            setVaults(prev => prev.map(v => 
              v.id === tempId ? newVault as Vault : v
            ).sort((a, b) => a.name.localeCompare(b.name)));
          }
          
          toast({ title: 'vault_created ✨' });
        } catch (error) {
          // Rollback optimistic update on error
          setVaults(prev => prev.filter(v => v.id !== tempId));
          throw error;
        }
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
  // Show loader for minimum time on first load with phase progress
  if (authLoading || showLoader) {
    return (
      <PhaseLoader
        phases={loadingPhases}
        title="initializing_refhub"
        subtitle="loading your research library"
        progress={loaderProgress}
      />
    );
  }

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

      <div className="flex-1 lg:pl-72 min-w-0">
        <PublicationList
        publications={publications}
        tags={tags}
        vaults={vaults.concat(sharedVaults)}
        publicationTagsMap={publicationTagsMap}
        publicationVaultsMap={publicationVaultsMap}
        relationsCountMap={relationsCountMap}
        selectedVault={null}
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
        publicationVaults={editingPublication ? publicationVaultsMap[editingPublication.id] || [] : []}
        onSave={handleSavePublication}
        onCreateTag={handleCreateTag}
        onAddToVaults={handleAddToVaults}
      />

      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        vaults={vaults}
        allPublications={publications}
        currentVaultId={null}
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
        vaultName={null}
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
