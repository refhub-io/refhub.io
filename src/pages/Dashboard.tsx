import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { logger } from '@/lib/logger';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag, PublicationRelation } from '@/types/database';
import { generateBibtexKey } from '@/lib/bibtex';
import { Sidebar } from '@/components/layout/Sidebar';
import { PublicationList } from '@/components/publications/PublicationList';
import { PublicationDialog } from '@/components/publications/PublicationDialog';
import { AddImportDialog } from '@/components/publications/AddImportDialog';
import { VaultDialog } from '@/components/vaults/VaultDialog';
import { CollectionAnalytics } from '@/components/publications/CollectionAnalytics';
import { ProfileDialog } from '@/components/profile/ProfileDialog';
import { ExportDialog } from '@/components/publications/ExportDialog';
import { PhaseLoader, LoadingPhase } from '@/components/ui/loading';
import { useToast } from '@/hooks/use-toast';
import { Sparkles } from 'lucide-react';
import { getPageCache, setPageCache, hasPageCache, clearPageCache } from '@/lib/pageCache';
import { buildVaultPublicationCopyPayload } from '@/lib/vaultPublicationAttribution';
import {
  fetchSemanticScholarMetadataByDoi,
  formatSemanticScholarErrorMessage,
  SemanticScholarMetadata,
} from '@/lib/semanticScholar';
import { createPublicationSyncPatch, extractBibliographicPatch, getPublicationSyncDiffs, PublicationSyncDiff } from '@/lib/publicationSync';
import { filterDashboardTags, getDashboardAccessibleVaultIds } from '@/lib/dashboardTagScope';
import { replacePublicationPdfAsset } from '@/lib/pdfAssets';
import { PublicationSyncDialog } from '@/components/publications/PublicationSyncDialog';
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

type PublicationDisplayField = keyof Pick<
  Publication,
  | 'title'
  | 'authors'
  | 'year'
  | 'journal'
  | 'volume'
  | 'issue'
  | 'pages'
  | 'doi'
  | 'url'
  | 'abstract'
  | 'pdf_url'
  | 'bibtex_key'
  | 'publication_type'
  | 'booktitle'
  | 'chapter'
  | 'edition'
  | 'editor'
  | 'howpublished'
  | 'institution'
  | 'number'
  | 'organization'
  | 'publisher'
  | 'school'
  | 'series'
  | 'type'
  | 'eid'
  | 'isbn'
  | 'issn'
  | 'keywords'
>;

const DISPLAY_METADATA_FIELDS: PublicationDisplayField[] = [
  'title',
  'authors',
  'year',
  'journal',
  'volume',
  'issue',
  'pages',
  'doi',
  'url',
  'abstract',
  'pdf_url',
  'bibtex_key',
  'publication_type',
  'booktitle',
  'chapter',
  'edition',
  'editor',
  'howpublished',
  'institution',
  'number',
  'organization',
  'publisher',
  'school',
  'series',
  'type',
  'eid',
  'isbn',
  'issn',
  'keywords',
];

const hasDisplayValue = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
};

const mergeMissingDisplayMetadata = (canonical: Publication, instance: Publication): Publication => {
  const merged: Publication = { ...canonical };

  DISPLAY_METADATA_FIELDS.forEach((field) => {
    const canonicalValue = merged[field];
    const instanceValue = instance[field];

    if (!hasDisplayValue(canonicalValue) && hasDisplayValue(instanceValue)) {
      (merged as Record<PublicationDisplayField, Publication[PublicationDisplayField]>)[field] = instanceValue;
    }
  });

  return merged;
};

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, refetch: refetchProfile } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  // Dashboard mutations are triggered from nested cards/dialogs where the specific
  // button often unmounts or lives several layers down; using the page shell keeps
  // fallback feedback local to the dashboard instead of the viewport corner.
  const dashboardFeedbackRef = useRef<HTMLDivElement>(null);
  
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
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState<Publication[]>([]);
  const [deleteVaultConfirmation, setDeleteVaultConfirmation] = useState<Vault | null>(null);
  const [syncLoadingIds, setSyncLoadingIds] = useState<Set<string>>(new Set());
  const [syncDiffsByPublication, setSyncDiffsByPublication] = useState<Record<string, PublicationSyncDiff[]>>({});
  const [syncMetadataByPublication, setSyncMetadataByPublication] = useState<Record<string, SemanticScholarMetadata>>({});
  const [syncPreviewPublication, setSyncPreviewPublication] = useState<Publication | null>(null);
  const [syncCooldowns, setSyncCooldowns] = useState<Record<string, number>>({});
  const [pdfAssetsMap, setPdfAssetsMap] = useState<Record<string, string | null>>({});
  const [pdfAssetsLoading, setPdfAssetsLoading] = useState(false);

  const syncDiffCounts = useMemo(
    () => Object.fromEntries(Object.entries(syncDiffsByPublication).map(([id, diffs]) => [id, diffs.length])),
    [syncDiffsByPublication],
  );

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
      setPdfAssetsLoading(true);
      const [pubsRes, ownedVaultsRes, sharedVaultsRes, vaultPubsRes, pubTagsRes, relationsRes, pdfAssetsRes] = await Promise.all([
        supabase.from('publications').select('*').order('created_at', { ascending: false }),
        supabase.from('vaults').select('*').eq('user_id', user.id).order('name'),
        // Fetch vaults shared with current user (via email or user_id)
        supabase
          .from('vault_shares')
          .select('vault_id')
          .or(`shared_with_email.eq.${user.email},shared_with_user_id.eq.${user.id}`),
        supabase.from('vault_publications').select('*').order('created_at', { ascending: false }),
        supabase.from('publication_tags').select('*'),
        supabase.from('publication_relations').select('*'),
        supabase
          .from('publication_pdf_assets')
          .select('publication_id, vault_publication_id, stored_pdf_url')
          .eq('storage_provider', 'google_drive')
          .eq('status', 'stored'),
      ]);

      // Build PDF assets map (keyed by publication_id for canonical, vault_publication_id for vault copies)
      const assetsMap: Record<string, string | null> = {};
      for (const row of (pdfAssetsRes.data || [])) {
        if (row.vault_publication_id) {
          assetsMap[row.vault_publication_id] = row.stored_pdf_url ?? null;
        } else if (row.publication_id) {
          assetsMap[row.publication_id] = row.stored_pdf_url ?? null;
        }
      }
      setPdfAssetsMap(assetsMap);
      setPdfAssetsLoading(false);

      // Complete vaults phase
      const ownedVaults = (ownedVaultsRes.data as Vault[]) || [];
      const sharedVaultIds = (sharedVaultsRes.data || []).map((share) => share.vault_id);
      const scopedVaultIds = getDashboardAccessibleVaultIds({ ownedVaults, sharedVaultIds });

      const tagQueries = [
        supabase
          .from('tags')
          .select('*')
          .eq('user_id', user.id)
          .is('vault_id', null)
          .order('name'),
      ];

      if (scopedVaultIds.length > 0) {
        tagQueries.push(
          supabase
            .from('tags')
            .select('*')
            .in('vault_id', scopedVaultIds)
            .order('name'),
        );
      }

      const tagResults = await Promise.all(tagQueries);
      const tagQueryError = tagResults.find((result) => result.error)?.error;
      if (tagQueryError) throw tagQueryError;

      const scopedTags = filterDashboardTags(
        tagResults.flatMap((result) => (result.data as Tag[] | null) || []),
        { userId: user.id, ownedVaults, sharedVaultIds },
      );
      const dedupedTags = Array.from(
        new Map(scopedTags.map((tag) => [tag.id, tag])).values(),
      ).sort((a, b) => a.name.localeCompare(b.name));

      setVaults(ownedVaults);
      updatePhase('vaults', 'complete');

      // Combine original publications with vault-specific copies
      // For the dashboard, we want to show all publications the user has access to
      const originalPublications = pubsRes.data as Publication[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // Process vault-specific copies and aggregate their display information.
      // all_papers remains deduplicated by canonical/original publication ID, but
      // sparse canonical rows can borrow missing bibliography fields from richer
      // vault instances. Vault-local copies themselves are not mutated.
      formattedVaultPublications.forEach(vp => {
        if (vp.original_publication_id) {
          const canonical = allPublicationsMap[vp.original_publication_id];

          if (canonical) {
            allPublicationsMap[vp.original_publication_id] = mergeMissingDisplayMetadata(canonical, vp as Publication);
          }
        } else {
          // If no original ID, treat as standalone (this shouldn't normally happen)
          if (!allPublicationsMap[vp.id]) {
            allPublicationsMap[vp.id] = vp;
          }
        }
      });

      const allPublications = Object.values(allPublicationsMap);

      if (sharedVaultsRes.data) {
        // Process shared vaults
        if (sharedVaultsRes.data.length > 0) {
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
      setTags(dedupedTags);
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
      setTags(dedupedTags);
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
        vaults: ownedVaults,
        sharedVaults: processedSharedVaults,
        tags: dedupedTags,
        publicationTags: pubTagsRes.data as PublicationTag[] || [],
        publicationRelations: relationsRes.data as PublicationRelation[] || [],
        publicationVaultsMap: newPublicationVaultsMap,
        publicationTagsMap,
        relationsCountMap,
      }, user?.id);
      
    } catch (error) {
      toast({
        title: 'Could not load dashboard data',
        description: 'RefHub could not load your library, vaults, or tags. Please refresh the page.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: dashboardFeedbackRef,
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
      logger.error('Dashboard', 'Error refetching vaults:', error);
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
      logger.error('Dashboard', 'Error refetching publication relations:', error);
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

  const handleSavePublication = async (data: Partial<Publication>, tagIds: string[], _vaultIds?: string[], isAutoSave = false, driveUrl?: string | null) => {
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
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          };

          const result = await supabase
            .from('vault_publications')
            .update(dataToSave)
            .eq('id', editingPublication.id)
            .select()
            .single();

          updatedPub = result.data;
          updateError = result.error;

          // Fan out bibliographic fields to canonical publication and sibling vault copies
          if (!updateError && vaultPub.original_publication_id) {
            const bibPatch = extractBibliographicPatch(dataToSave);
            if (Object.keys(bibPatch).length > 0) {
              const now = new Date().toISOString();
              supabase.from('publications')
                .update({ ...bibPatch, updated_at: now })
                .eq('id', vaultPub.original_publication_id)
                .then(({ error: e }) => { if (e) console.warn('[sync] canonical fan-out error:', e.message); });
              supabase.from('vault_publications')
                .update({ ...bibPatch, updated_at: now, updated_by: user.id })
                .eq('original_publication_id', vaultPub.original_publication_id)
                .neq('id', editingPublication.id)
                .then(({ error: e }) => { if (e) console.warn('[sync] sibling fan-out error:', e.message); });
            }
          }

          // Persist Drive PDF asset if a new URL was uploaded
          if (!updateError && driveUrl) {
            const assetRecord = {
              user_id: user.id,
              publication_id: vaultPub.original_publication_id,
              vault_publication_id: editingPublication.id,
              storage_provider: 'google_drive' as const,
              stored_pdf_url: driveUrl,
              stored_file_id: null as string | null,
              status: 'stored',
              error_message: null as string | null,
            };
            supabase.from('publication_pdf_assets')
              .upsert(assetRecord, { onConflict: 'vault_publication_id,storage_provider' })
              .then(({ error: e }) => { if (e) console.warn('[drive] pdf asset upsert:', e.message); });
            if (vaultPub.original_publication_id) {
              replacePublicationPdfAsset(supabase, { ...assetRecord, vault_publication_id: null })
                .catch((e) => { console.warn('[drive] canonical pdf asset replace:', e.message); });
            }
            setPdfAssetsMap(prev => ({ ...prev, [editingPublication.id]: driveUrl }));
          }
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

          // Fan out bibliographic fields to all vault copies of this publication
          if (!updateError) {
            const bibPatch = extractBibliographicPatch(dataToSave);
            if (Object.keys(bibPatch).length > 0) {
              supabase.from('vault_publications')
                .update({ ...bibPatch, updated_at: new Date().toISOString(), updated_by: user.id })
                .eq('original_publication_id', editingPublication.id)
                .then(({ error: e }) => { if (e) console.warn('[sync] vault fan-out error:', e.message); });
            }
          }

          // Persist Drive PDF asset for canonical publication
          if (!updateError && driveUrl) {
            replacePublicationPdfAsset(supabase, {
              user_id: user.id,
              publication_id: editingPublication.id,
              vault_publication_id: null,
              storage_provider: 'google_drive' as const,
              stored_pdf_url: driveUrl,
              stored_file_id: null as string | null,
              status: 'stored',
              error_message: null as string | null,
            }).catch((e) => { console.warn('[drive] pdf asset replace:', e.message); });
            setPdfAssetsMap(prev => ({ ...prev, [editingPublication.id]: driveUrl }));
          }
        }

        if (updateError) throw updateError;

        // Update tags - use the original publication ID for tagging
        // Check if this is a vault-specific copy and get the original publication ID

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
          logger.error('Dashboard', 'Error fetching existing tags:', fetchError);
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
            logger.error('Dashboard', 'Error deleting existing tags:', deleteError);
            throw deleteError;
          }
        }

        // Determine which tags to add (in new selection but don't exist yet)
        const tagsToAdd = tagIds.filter(newId => !existingTagIds.includes(newId));

        if (tagsToAdd.length > 0) {
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
            logger.error('Dashboard', 'Error inserting new tags:', insertError);
            throw insertError;
          }
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

        // Update editingPublication with persisted data so the still-open dialog
        // stays in sync after manual saves as well as auto-saves.
        setEditingPublication({ ...editingPublication, ...updatedPub } as Publication);

        if (!isAutoSave) {
          toast({ title: 'Paper updated ✨', source: dashboardFeedbackRef });
        }
      } else {
        // Check for duplicates before adding
        const duplicate = checkForDuplicate(data, publications);
        if (duplicate) {
          toast({
            title: 'Duplicate paper detected',
            description: `This looks like an existing paper: "${duplicate.title.substring(0, 50)}...". Open the existing record or change the DOI/title before saving.`,
            variant: 'destructive', feedbackSeverity: 'error',
            source: dashboardFeedbackRef,
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

        toast({ title: 'Paper added ✨', source: dashboardFeedbackRef });
      }

      // Keep the current publication selected after manual save so the dialog can
      // continue showing the persisted values instead of reopening in empty
      // create mode. The dialog close handler clears editingPublication.
    } catch (error) {
      toast({
        title: 'Could not save paper',
        description: (error as Error).message || 'RefHub could not save this paper. Your edits are still in the dialog.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: dashboardFeedbackRef,
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
        title: 'No papers to import',
        description: 'Every selected paper appears to already exist in your library, so nothing was imported.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: dashboardFeedbackRef,
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
        title: 'Could not import papers',
        description: (error as Error).message || 'RefHub could not import the selected papers. Review the preview and try again.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: dashboardFeedbackRef,
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

      // For each vault, create a copy from the best metadata we already have in
      // memory. Bibliographic fields are canonical/static, so the all_papers
      // merged display row should not fall back to a sparse public.publications
      // row. Notes and tags remain vault-local and are not copied here.
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
          const bestAvailableSource = vaultPub || publications.find(p => p.id === sourcePublicationId) || sourcePublication;
          const { error: insertError } = await supabase
            .from('vault_publications')
            .insert(buildVaultPublicationCopyPayload(bestAvailableSource, vaultId, user.id, undefined, {
              originalPublicationId: sourcePublicationId,
            }));

          if (insertError) throw insertError;
        }
      }

      toast({ title: `Added to ${vaultIds.length} vault${vaultIds.length > 1 ? 's' : ''} ✨`, source: dashboardFeedbackRef });

      // Refresh the data to reflect the changes
      await fetchData();
    } catch (error) {
      toast({
        title: 'Error adding paper',
        description: (error as Error).message,
        variant: 'destructive', feedbackSeverity: 'error',
      });
      throw error;
    }
  };

  const startSyncCooldown = useCallback((publicationId: string) => {
    setSyncCooldowns(prev => ({ ...prev, [publicationId]: 10 }));
  }, []);

  useEffect(() => {
    const hasActiveCooldown = Object.values(syncCooldowns).some(seconds => seconds > 0);
    if (!hasActiveCooldown) return;

    const timer = window.setTimeout(() => {
      setSyncCooldowns(prev => {
        const next: Record<string, number> = {};
        for (const [id, seconds] of Object.entries(prev)) {
          const remaining = Math.max(0, seconds - 1);
          if (remaining > 0) next[id] = remaining;
        }
        return next;
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [syncCooldowns]);

  const handleCheckPublicationSync = useCallback(async (publication: Publication) => {
    if (!publication.doi) {
      toast({ title: 'DOI required for sync', description: 'Semantic Scholar detail sync needs a DOI on this paper before it can look up metadata.', variant: 'destructive', feedbackSeverity: 'error', source: dashboardFeedbackRef });
      return;
    }
    if ((syncCooldowns[publication.id] || 0) > 0 || syncLoadingIds.has(publication.id)) {
      return;
    }
    startSyncCooldown(publication.id);
    setSyncLoadingIds(prev => new Set(prev).add(publication.id));
    try {
      const metadata = await fetchSemanticScholarMetadataByDoi(publication.doi);
      if (!metadata) {
        setSyncDiffsByPublication(prev => ({ ...prev, [publication.id]: [] }));
        toast({ title: 'No Semantic Scholar match', description: 'Semantic Scholar did not return metadata for this DOI.', feedbackSeverity: 'warning', source: dashboardFeedbackRef });
        return;
      }
      const diffs = getPublicationSyncDiffs(publication, metadata);
      setSyncMetadataByPublication(prev => ({ ...prev, [publication.id]: metadata }));
      setSyncDiffsByPublication(prev => ({ ...prev, [publication.id]: diffs }));
      if (diffs.length > 0) {
        setSyncPreviewPublication(publication);
        toast({ title: `Found ${diffs.length} metadata update${diffs.length === 1 ? '' : 's'}`, description: 'Review incoming Semantic Scholar details before applying them to this paper.', feedbackSeverity: 'info', source: dashboardFeedbackRef });
      } else {
        toast({ title: 'Metadata is up to date', description: 'Semantic Scholar details already match this publication.', source: dashboardFeedbackRef });
      }
    } catch (error) {
      toast({
        title: 'Semantic Scholar sync failed',
        description: formatSemanticScholarErrorMessage(error),
        variant: 'destructive', feedbackSeverity: 'error',
        source: dashboardFeedbackRef,
      });
    } finally {
      setSyncLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(publication.id);
        return next;
      });
    }
  }, [startSyncCooldown, syncCooldowns, syncLoadingIds, toast]);

  const handleApplyPublicationSync = useCallback(async (selectedDiffs: PublicationSyncDiff[]) => {
    if (!syncPreviewPublication || selectedDiffs.length === 0) return;

    const patch = createPublicationSyncPatch(selectedDiffs);
    const { error } = await supabase
      .from('publications')
      .update(patch)
      .eq('id', syncPreviewPublication.id);

    if (error) {
      toast({ title: 'Could not apply metadata', description: error.message || 'RefHub could not apply the selected Semantic Scholar fields.', variant: 'destructive', feedbackSeverity: 'error', source: dashboardFeedbackRef });
      return;
    }

    // Fan out the same bibliographic patch to all vault copies
    const bibPatch = extractBibliographicPatch(patch);
    if (Object.keys(bibPatch).length > 0) {
      supabase.from('vault_publications')
        .update({ ...bibPatch, updated_at: new Date().toISOString(), updated_by: user?.id })
        .eq('original_publication_id', syncPreviewPublication.id)
        .then(({ error: e }) => { if (e) console.warn('[sync] vault fan-out error:', e.message); });
    }

    // Keep the edit dialog form in sync with the applied changes
    if (editingPublication?.id === syncPreviewPublication.id) {
      setEditingPublication(prev => prev ? { ...prev, ...patch } as Publication : prev);
    }

    setSyncDiffsByPublication(prev => ({ ...prev, [syncPreviewPublication.id]: [] }));
    setSyncPreviewPublication(null);
    await fetchData();
  }, [syncDiffsByPublication, syncPreviewPublication, toast, fetchData, user?.id, editingPublication]);

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
          variant: 'destructive', feedbackSeverity: 'error',
        });
        return;
      }

      // Optimistic update
      setPublications(prev => prev.filter(p => p.id !== deletedId));
      setPublicationTags(prev => prev.filter(pt => pt.publication_id !== deletedId));
      clearPageCache('dashboard');

      toast({ title: 'Paper deleted', source: dashboardFeedbackRef });
    } catch (error) {
      // Revert on error
      fetchData();
      toast({
        title: 'Could not delete paper',
        description: (error as Error).message || 'RefHub could not delete this paper. Refresh and try again.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: dashboardFeedbackRef,
      });
    } finally {
      setDeleteConfirmation(null);
    }
  };

  const handleBulkDeletePublications = async () => {
    if (!bulkDeleteConfirmation.length) return;

    const ids = bulkDeleteConfirmation.map(p => p.id);

    try {
      // Separate vault-specific copies from original publications
      const { data: vaultPubs } = await supabase
        .from('vault_publications')
        .select('id')
        .in('id', ids);

      const vaultPubIds = new Set((vaultPubs || []).map((vp: { id: string }) => vp.id));
      const originalIds = ids.filter(id => !vaultPubIds.has(id));

      if (vaultPubIds.size > 0) {
        const { error } = await supabase
          .from('vault_publications')
          .delete()
          .in('id', Array.from(vaultPubIds));
        if (error) throw error;
      }

      if (originalIds.length > 0) {
        const { error } = await supabase
          .from('publications')
          .delete()
          .in('id', originalIds);
        if (error) throw error;
      }

      // Optimistic update
      setPublications(prev => prev.filter(p => !ids.includes(p.id)));
      setPublicationTags(prev => prev.filter(pt => !ids.includes(pt.publication_id)));
      clearPageCache('dashboard');

      toast({ title: `${ids.length} paper${ids.length !== 1 ? 's' : ''} deleted` });
    } catch (error) {
      fetchData();
      toast({
        title: 'Could not delete papers',
        description: (error as Error).message || 'RefHub could not delete the selected papers. Refresh and try again.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: dashboardFeedbackRef,
      });
    } finally {
      setBulkDeleteConfirmation([]);
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
          title: 'Cannot delete vault',
          description: `This vault has ${forks.length} fork${forks.length > 1 ? 's' : ''}. Public vaults with forks cannot be deleted.`,
          variant: 'destructive', feedbackSeverity: 'error',
          source: dashboardFeedbackRef,
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

      toast({ title: 'Vault deleted', source: dashboardFeedbackRef });
      setIsVaultDialogOpen(false);
    } catch (error) {
      // Revert on error
      fetchData();
      toast({
        title: 'Could not delete vault',
        description: (error as Error).message || 'RefHub could not delete this vault. Refresh and try again.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: dashboardFeedbackRef,
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
          variant: 'destructive', feedbackSeverity: 'error',
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

      // Use functional updater with dedupe check to prevent race with realtime
      setTags(prev => {
        if (prev.some(t => t.id === (data as Tag).id)) return prev;
        return [...prev, data as Tag];
      });
      return data as Tag;
    } catch (error) {
      // Check if the error is due to the unique constraint violation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any)?.code === '23505') { // PostgreSQL unique violation error code
        toast({
          title: 'Tag already exists',
          description: `A tag with the name "${name}" already exists in your personal tags.`,
          variant: 'destructive', feedbackSeverity: 'error',
        });
        return null;
      }

      toast({
        title: 'Could not create tag',
        description: (error as Error).message || 'RefHub could not create this tag. Check the name and try again.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: dashboardFeedbackRef,
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
        title: 'Could not update tag',
        description: (error as Error).message || 'RefHub could not save this tag change. Refresh and try again.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: dashboardFeedbackRef,
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
        setEditingVault(updatedVault as Vault);
        
        toast({ title: 'Vault updated ✨', source: dashboardFeedbackRef });
        return updatedVault as Vault;
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
          
          // Replace temporary vault with real one from database and go straight to it.
          if (newVault) {
            const createdVault = newVault as Vault;
            setVaults(prev => prev.map(v => 
              v.id === tempId ? createdVault : v
            ).sort((a, b) => a.name.localeCompare(b.name)));
            navigate(`/vault/${createdVault.id}`);
          }
          
          toast({ title: 'Vault created ✨', source: dashboardFeedbackRef });
          setEditingVault(null);
          return newVault as Vault;
        } catch (error) {
          // Rollback optimistic update on error
          setVaults(prev => prev.filter(v => v.id !== tempId));
          throw error;
        }
      }
    } catch (error) {
      toast({
        title: 'Could not add to vaults',
        description: (error as Error).message || 'RefHub could not add this paper to the selected vaults. Refresh and try again.',
        variant: 'destructive', feedbackSeverity: 'error',
        source: dashboardFeedbackRef,
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
    <div ref={dashboardFeedbackRef} className="min-h-screen bg-background flex">
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

      <div className="flex-1 lg:pl-72 min-w-0 flex flex-col min-h-screen">
        <PublicationList
        publications={publications}
        tags={tags}
        vaults={vaults.concat(sharedVaults)}
        publicationTagsMap={publicationTagsMap}
        publicationVaultsMap={publicationVaultsMap}
        relationsCountMap={relationsCountMap}
        selectedVault={null}
        onAddPublication={() => setIsImportDialogOpen(true)}
        onEditPublication={(pub) => {
          setEditingPublication(pub);
          setIsPublicationDialogOpen(true);
        }}
        onDeletePublication={(pub) => setDeleteConfirmation(pub)}
        onDeletePublications={(pubs) => pubs.length === 1 ? setDeleteConfirmation(pubs[0]) : setBulkDeleteConfirmation(pubs)}
        onExportBibtex={handleExportBibtex}
        onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
        onOpenGraph={() => setIsGraphOpen(true)}
        onEditVault={(vault) => {
          setEditingVault(vault);
          setIsVaultDialogOpen(true);
        }}
        onVaultUpdate={refetchVaults}
        driveUrlsMap={pdfAssetsMap}
        driveLoading={pdfAssetsLoading}
        syncDiffCounts={syncDiffCounts}
        syncLoadingIds={syncLoadingIds}
        syncCooldowns={syncCooldowns}
        onCheckPublicationSync={handleCheckPublicationSync}
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
        driveUploadContext="publication"
        driveUrl={editingPublication ? (pdfAssetsMap[editingPublication.id] ?? null) : null}
        onCreateTag={handleCreateTag}
        onAddToVaults={handleAddToVaults}
        onCheckSync={handleCheckPublicationSync}
        syncLoading={editingPublication ? syncLoadingIds.has(editingPublication.id) : false}
        syncCooldownSeconds={editingPublication ? syncCooldowns[editingPublication.id] || 0 : 0}
      />

      <PublicationSyncDialog
        open={!!syncPreviewPublication}
        onOpenChange={(open) => !open && setSyncPreviewPublication(null)}
        diffs={syncPreviewPublication ? syncDiffsByPublication[syncPreviewPublication.id] || [] : []}
        onApply={handleApplyPublicationSync}
      />

      <AddImportDialog
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

      <CollectionAnalytics
        open={isGraphOpen}
        onOpenChange={setIsGraphOpen}
        publications={publications}
        relations={publicationRelations}
        tags={tags}
        publicationTags={publicationTags}
        onSelectPublication={(pub) => {
          setEditingPublication(pub);
          setIsPublicationDialogOpen(true);
        }}
      />

      <ExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        publications={exportPublications}
        vaultName={undefined}
        tags={tags}
        publicationTags={publicationTags}
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

      <AlertDialog open={bulkDeleteConfirmation.length > 0} onOpenChange={() => setBulkDeleteConfirmation([])}>
        <AlertDialogContent className="border-2 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold font-mono">delete_papers?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-sm">
              // this_will_permanently_delete {bulkDeleteConfirmation.length} paper{bulkDeleteConfirmation.length !== 1 ? 's' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDeletePublications} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono">
              delete({bulkDeleteConfirmation.length})
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
