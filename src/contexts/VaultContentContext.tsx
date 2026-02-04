import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag, PublicationRelation, VaultShare } from '@/types/database';
import { useVaultAccess } from '@/hooks/useVaultAccess';
import { handleError } from '@/lib/toast';
import { debug, warn } from '@/lib/logger';
import { getPageCache, setPageCache } from '@/lib/pageCache';

// Info about the last activity in the vault
export type ActivityType = 'publication_added' | 'publication_updated' | 'publication_removed' | 'tag_added' | 'tag_updated' | 'tag_removed';

export interface LastActivityInfo {
  timestamp: string;
  userId: string | null;
  userName: string | null;
  type: ActivityType;
}

// Cache structure for vault content
interface VaultContentCache {
  currentVault: Vault | null;
  publications: Publication[];
  tags: Tag[];
  publicationTags: PublicationTag[];
  publicationRelations: PublicationRelation[];
  vaultShares: VaultShare[];
}

interface VaultContentContextType {
  currentVault: Vault | null;
  publications: Publication[];
  tags: Tag[];
  publicationTags: PublicationTag[];
  publicationRelations: PublicationRelation[];
  vaultShares: VaultShare[];
  loading: boolean;
  error: string | null;
  setCurrentVaultId: (vaultId: string) => void;
  setPublications: React.Dispatch<React.SetStateAction<Publication[]>>;
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  setPublicationTags: React.Dispatch<React.SetStateAction<PublicationTag[]>>;
  setPublicationRelations: React.Dispatch<React.SetStateAction<PublicationRelation[]>>;
  setVaultShares: React.Dispatch<React.SetStateAction<VaultShare[]>>;
  // New methods for optimistic updates
  refreshVaultContent: () => Promise<void>;
  isRealtimeConnected: boolean;
  // Last activity tracking
  lastActivity: LastActivityInfo | null;
  updateLastActivity: (type: ActivityType, userId: string | null) => void;
}

const VaultContentContext = createContext<VaultContentContextType | undefined>(undefined);

interface VaultContentProviderProps {
  children: ReactNode;
}

export function VaultContentProvider({ children }: VaultContentProviderProps) {
  const { user } = useAuth();
  const [currentVault, setCurrentVault] = useState<Vault | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [publicationTags, setPublicationTags] = useState<PublicationTag[]>([]);
  const [publicationRelations, setPublicationRelations] = useState<PublicationRelation[]>([]);
  const [vaultShares, setVaultShares] = useState<VaultShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [lastActivity, setLastActivity] = useState<LastActivityInfo | null>(null);

  const [currentVaultId, setCurrentVaultIdState] = useState<string | null>(null);
  
  // Track pending optimistic updates to avoid overwriting them with realtime data
  const pendingUpdatesRef = useRef<Set<string>>(new Set());
  
  // Track when we made a local activity update to prevent realtime from overwriting it
  const lastLocalActivityUpdateRef = useRef<number>(0);
  
  // Cache for user profile names to avoid repeated lookups
  const userProfileCacheRef = useRef<Map<string, string>>(new Map());
  
  // Track if we have cached data for the current vault (to skip loading state)
  const hasCachedContentRef = useRef(false);

  const { canView, refresh } = useVaultAccess(currentVaultId || '');
  
  // Helper to get user display name (with caching)
  const getUserDisplayName = useCallback(async (userId: string): Promise<string | null> => {
    if (userProfileCacheRef.current.has(userId)) {
      return userProfileCacheRef.current.get(userId) || null;
    }
    
    try {
      // Try user_id first (standard lookup)
      let { data: profile, error } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('user_id', userId)
        .maybeSingle();
      
      // If not found by user_id, try by id (some profiles might use id as the user reference)
      if (!profile && !error) {
        const result = await supabase
          .from('profiles')
          .select('display_name, username')
          .eq('id', userId)
          .maybeSingle();
        profile = result.data;
        error = result.error;
      }
      
      if (error) {
        warn('VaultContentContext', 'Error fetching profile for user:', userId, error);
        return null;
      }
      
      const displayName = profile?.display_name || profile?.username || null;
      debug('VaultContentContext', 'getUserDisplayName result:', { userId, displayName, profile });
      if (displayName) {
        userProfileCacheRef.current.set(userId, displayName);
      }
      return displayName;
    } catch (err) {
      warn('VaultContentContext', 'Failed to fetch user display name:', err);
      return null;
    }
  }, []);
  
  // Helper to update last activity
  // isFromRealtime: if true, this is from a realtime event (may have stale user info)
  const updateLastActivity = useCallback(async (
    type: ActivityType,
    userId: string | null,
    timestamp?: string,
    isFromRealtime?: boolean
  ) => {
    debug('VaultContentContext', 'updateLastActivity called:', { type, userId, timestamp, isFromRealtime });
    
    // Skip realtime updates if we recently made a local update (within 2 seconds)
    // This prevents realtime from overwriting with incorrect user (e.g., created_by instead of actual updater)
    if (isFromRealtime && Date.now() - lastLocalActivityUpdateRef.current < 2000) {
      debug('VaultContentContext', 'Skipping realtime activity update - recent local update');
      return;
    }
    
    // Track local updates
    if (!isFromRealtime) {
      lastLocalActivityUpdateRef.current = Date.now();
    }
    
    const userName = userId ? await getUserDisplayName(userId) : null;
    debug('VaultContentContext', 'Setting lastActivity with userName:', userName);
    setLastActivity({
      timestamp: timestamp || new Date().toISOString(),
      userId,
      userName,
      type,
    });
  }, [getUserDisplayName]);

  // Helper to convert vault publication to Publication format
  const formatVaultPublication = useCallback((vp: any): Publication => ({
    id: vp.id,
    user_id: vp.created_by,
    title: vp.title,
    authors: vp.authors || [],
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
    publication_type: vp.publication_type || 'article',
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
    original_publication_id: vp.original_publication_id,
  }), []);

  // Fetch vault content - extracted as a reusable function
  const fetchVaultContent = useCallback(async () => {
    if (!currentVaultId || !user || !canView) {
      debug('VaultContentContext', 'Skipping fetch - conditions not met', { hasId: !!currentVaultId, hasUser: !!user, canView });
      return;
    }

    debug('VaultContentContext', 'Starting fetch for vault:', currentVaultId, 'hasCached:', hasCachedContentRef.current);
    // Only show loading if we don't have cached data for this vault
    if (!hasCachedContentRef.current) {
      setLoading(true);
    }
    setError(null);

    try {
      // Fetch publications in this vault - prioritize vault-specific copies
      const [
        vaultPubsRes,
        tagsRes,
        sharesRes
      ] = await Promise.all([
        supabase
          .from('vault_publications')
          .select('*')
          .eq('vault_id', currentVaultId)
          .order('created_at', { ascending: false }),
        supabase.from('tags').select('*').eq('vault_id', currentVaultId).order('name'),
        supabase.from('vault_shares').select('*').eq('vault_id', currentVaultId)
      ]);

      // Get the vault publication IDs to fetch specific publication tags
      const vaultPublications = vaultPubsRes.data as any[];
      const vaultPublicationIds = vaultPublications?.map(vp => vp.id).filter(id => id) || [];
      const originalPublicationIds = vaultPublications?.map(vp => vp.original_publication_id).filter(id => id) || [];

      // Fetch publication relations
      const allRelationsRes = await supabase
        .from('publication_relations')
        .select('*');

      // Filter relations to only include those relevant to this vault's publications
      const allPublicationIdsSet = new Set([...vaultPublicationIds, ...originalPublicationIds]);
      const filteredRelations = allRelationsRes.data?.filter(rel =>
        allPublicationIdsSet.has(rel.publication_id) ||
        allPublicationIdsSet.has(rel.related_publication_id)
      ) || [];

      const relationsRes = { data: filteredRelations, error: allRelationsRes.error };

      // Fetch publication tags for both the vault-specific copies and the original publications
      let pubTagsRes;
      if (vaultPublicationIds.length > 0 || originalPublicationIds.length > 0) {
        let vaultTags: any[] = [];
        let originalTags: any[] = [];

        if (vaultPublicationIds.length > 0) {
          const { data: vtData, error: vtError } = await supabase
            .from('publication_tags')
            .select('*')
            .in('vault_publication_id', vaultPublicationIds);
          if (!vtError) vaultTags = vtData || [];
        }

        if (originalPublicationIds.length > 0) {
          const { data: otData, error: otError } = await supabase
            .from('publication_tags')
            .select('*')
            .in('publication_id', originalPublicationIds);
          if (!otError) originalTags = otData || [];
        }

        pubTagsRes = { data: [...vaultTags, ...originalTags], error: null };
      } else {
        pubTagsRes = { data: [], error: null };
      }

      if (vaultPubsRes.error) throw vaultPubsRes.error;
      if (tagsRes.error) throw tagsRes.error;
      if (pubTagsRes.error) throw pubTagsRes.error;
      if (relationsRes.error) throw relationsRes.error;
      if (sharesRes.error) throw sharesRes.error;

      // Get the vault details
      const { data: vaultData, error: vaultError } = await supabase
        .from('vaults')
        .select('*')
        .eq('id', currentVaultId)
        .single();

      if (vaultError) throw vaultError;

      // Convert vault publications to the same format as original publications
      const formattedVaultPublications = (vaultPublications || []).map(formatVaultPublication);

      // Find the most recently updated publication to set initial lastActivity
      let mostRecentActivity: { timestamp: string; updatedBy: string | null } | null = null;
      if (vaultPublications && vaultPublications.length > 0) {
        const sorted = [...vaultPublications].sort((a, b) => 
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        const mostRecent = sorted[0];
        if (mostRecent) {
          mostRecentActivity = {
            timestamp: mostRecent.updated_at,
            updatedBy: mostRecent.updated_by || null, // Use updated_by if available
          };
        }
      }

      // Batch state updates to reduce re-renders
      setCurrentVault(vaultData as Vault);
      setPublications(formattedVaultPublications);
      setTags(tagsRes.data as Tag[]);
      setPublicationTags(pubTagsRes.data as PublicationTag[]);
      setPublicationRelations(relationsRes.data as PublicationRelation[]);
      setVaultShares(sharesRes.data as VaultShare[]);
      
      // Save to cache for instant restore when switching back
      const cacheKey = `vault-content-${currentVaultId}` as const;
      setPageCache<VaultContentCache>(cacheKey, {
        currentVault: vaultData as Vault,
        publications: formattedVaultPublications,
        tags: tagsRes.data as Tag[],
        publicationTags: pubTagsRes.data as PublicationTag[],
        publicationRelations: relationsRes.data as PublicationRelation[],
        vaultShares: sharesRes.data as VaultShare[],
      });
      
      // Set initial lastActivity based on most recently updated publication
      // Now uses updated_by field if available to show who made the last update
      // Only set if we don't already have a more recent local activity
      if (mostRecentActivity && Date.now() - lastLocalActivityUpdateRef.current > 2000) {
        const userName = mostRecentActivity.updatedBy 
          ? await getUserDisplayName(mostRecentActivity.updatedBy) 
          : null;
        setLastActivity({
          timestamp: mostRecentActivity.timestamp,
          userId: mostRecentActivity.updatedBy,
          userName,
          type: 'publication_updated', // We don't know the actual type, default to updated
        });
      }
      
      debug('VaultContentContext', 'Completed fetch, all state updated');
    } catch (err) {
      // On error, show toast but keep existing data (graceful degradation)
      const message = handleError(err, 'loading vault content', publications.length > 0);
      // Only set error state if we have no cached data
      if (publications.length === 0) {
        setError(message);
      }
    } finally {
      setLoading(false);
      debug('VaultContentContext', 'Loading set to false');
    }
  }, [currentVaultId, user, canView, formatVaultPublication]);

  // Refresh function that can be called externally
  const refreshVaultContent = useCallback(async () => {
    await fetchVaultContent();
  }, [fetchVaultContent]);

  // Fetch vault content when vaultId changes
  useEffect(() => {
    debug('VaultContentContext', 'Effect triggered', { currentVaultId, user: !!user, canView });
    if (!currentVaultId || !user || !canView) {
      return;
    }
    fetchVaultContent();
  }, [currentVaultId, user, canView, fetchVaultContent]);

  const setCurrentVaultId = useCallback((vaultId: string) => {
    // Check cache first for instant restore
    const cacheKey = `vault-content-${vaultId}` as const;
    const cached = getPageCache<VaultContentCache>(cacheKey);
    
    if (cached) {
      debug('VaultContentContext', 'Restoring vault content from cache:', vaultId);
      hasCachedContentRef.current = true;
      setCurrentVault(cached.currentVault);
      setPublications(cached.publications);
      setTags(cached.tags);
      setPublicationTags(cached.publicationTags);
      setPublicationRelations(cached.publicationRelations);
      setVaultShares(cached.vaultShares);
      // Don't set loading - we have cached data
    } else {
      // No cache - clear old data to prevent showing stale content
      hasCachedContentRef.current = false;
      setCurrentVault(null);
      setPublications([]);
      setTags([]);
      setPublicationTags([]);
      setPublicationRelations([]);
      setVaultShares([]);
    }
    
    setCurrentVaultIdState(vaultId);
  }, []);

  // Set up a single real-time subscription for all vault-related changes
  useEffect(() => {
    if (!currentVaultId || !user) {
      debug('VaultContentContext', 'Skipping real-time subscription - no vaultId or user', { currentVaultId: !!currentVaultId, user: !!user });
      setIsRealtimeConnected(false);
      return;
    }

    debug('VaultContentContext', 'Setting up unified real-time subscription for vault', currentVaultId);

    const channel = supabase
      .channel(`vault-content-sync-${currentVaultId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vault_publications',
          filter: `vault_id=eq.${currentVaultId}`,
        },
        async (payload) => {
          debug('VaultContentContext', 'Received realtime update for vault publications:', payload);
          const eventType = payload.eventType;
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          const recordId = newRecord?.id || oldRecord?.id;

          // Skip if this is from our own pending optimistic update
          if (pendingUpdatesRef.current.has(recordId)) {
            debug('VaultContentContext', 'Skipping realtime update for pending optimistic update:', recordId);
            return;
          }

          if (eventType === 'INSERT') {
            // Add new publication (from another client)
            setPublications(prev => {
              // Check if we already have this publication
              if (prev.some(p => p.id === newRecord.id)) {
                return prev;
              }
              return [formatVaultPublication(newRecord), ...prev];
            });
            // Track activity (from realtime)
            updateLastActivity('publication_added', newRecord.created_by, newRecord.created_at, true);
          } else if (eventType === 'UPDATE') {
            // Update existing publication
            setPublications(prev =>
              prev.map(pub =>
                pub.id === newRecord.id
                  ? formatVaultPublication(newRecord)
                  : pub
              )
            );
            // Track activity - use updated_by if available (new field), fallback to created_by
            const updaterId = newRecord.updated_by || newRecord.created_by;
            debug('VaultContentContext', 'UPDATE event - updated_by:', newRecord.updated_by, 'created_by:', newRecord.created_by, 'using:', updaterId);
            updateLastActivity('publication_updated', updaterId, newRecord.updated_at, true);
          } else if (eventType === 'DELETE') {
            // Remove publication
            const deletedId = oldRecord?.id;
            if (deletedId) {
              setPublications(prev => prev.filter(pub => pub.id !== deletedId));
              // Also remove associated publication tags
              setPublicationTags(prev => prev.filter(pt => 
                pt.vault_publication_id !== deletedId && pt.publication_id !== deletedId
              ));
              // Track activity - use updated_by if available for who deleted it
              const deleterId = oldRecord.updated_by || oldRecord.created_by;
              updateLastActivity('publication_removed', deleterId, undefined, true);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tags',
          filter: `vault_id=eq.${currentVaultId}`,
        },
        async (payload) => {
          debug('VaultContentContext', 'Received realtime update for tags:', payload);
          const eventType = payload.eventType;
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          const recordId = newRecord?.id || oldRecord?.id;

          // Skip if this is from our own pending optimistic update
          if (pendingUpdatesRef.current.has(recordId)) {
            debug('VaultContentContext', 'Skipping realtime tag update for pending optimistic update:', recordId);
            return;
          }

          if (eventType === 'INSERT') {
            setTags(prev => {
              if (prev.some(t => t.id === newRecord.id)) {
                return prev;
              }
              return [...prev, newRecord as Tag];
            });
            // Track activity
            updateLastActivity('tag_added', newRecord.user_id, newRecord.created_at, true);
          } else if (eventType === 'UPDATE') {
            setTags(prev =>
              prev.map(tag =>
                tag.id === newRecord.id ? { ...tag, ...newRecord } : tag
              )
            );
            // Track activity
            updateLastActivity('tag_updated', newRecord.user_id, newRecord.updated_at, true);
          } else if (eventType === 'DELETE') {
            const deletedId = oldRecord?.id;
            if (deletedId) {
              setTags(prev => prev.filter(tag => tag.id !== deletedId));
              // Also remove associated publication tags
              setPublicationTags(prev => prev.filter(pt => pt.tag_id !== deletedId));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'publication_tags',
        },
        async (payload) => {
          debug('VaultContentContext', 'Received realtime update for publication tags:', payload);
          const eventType = payload.eventType;
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;

          // Check if this publication tag belongs to a publication in the current vault
          const vaultPublicationId = newRecord?.vault_publication_id || oldRecord?.vault_publication_id;
          
          if (vaultPublicationId) {
            // Verify the publication belongs to this vault
            const belongsToVault = publications.some(p => p.id === vaultPublicationId);
            if (!belongsToVault) {
              return; // Not relevant to this vault
            }
          } else {
            // For original publication tags, check if relevant to this vault
            const publicationId = newRecord?.publication_id || oldRecord?.publication_id;
            if (!publicationId) return;
            
            // Check if any vault publication references this original
            const isRelevant = publications.some(p => 
              (p as any).original_publication_id === publicationId
            );
            if (!isRelevant) return;
          }

          if (eventType === 'INSERT') {
            setPublicationTags(prev => {
              if (prev.some(pt => pt.id === newRecord.id)) {
                return prev;
              }
              return [...prev, newRecord as PublicationTag];
            });
          } else if (eventType === 'UPDATE') {
            setPublicationTags(prev =>
              prev.map(pt =>
                pt.id === newRecord.id ? { ...pt, ...newRecord } : pt
              )
            );
          } else if (eventType === 'DELETE') {
            const deletedId = oldRecord?.id;
            if (deletedId) {
              setPublicationTags(prev => prev.filter(pt => pt.id !== deletedId));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vault_shares',
          filter: `vault_id=eq.${currentVaultId}`,
        },
        async (payload) => {
          debug('VaultContentContext', 'Received realtime update for vault shares:', payload);
          const eventType = payload.eventType;
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;

          if (eventType === 'INSERT') {
            setVaultShares(prev => {
              if (prev.some(s => s.id === newRecord.id)) {
                return prev;
              }
              return [...prev, newRecord as VaultShare];
            });
          } else if (eventType === 'UPDATE') {
            setVaultShares(prev =>
              prev.map(share =>
                share.id === newRecord.id ? { ...share, ...newRecord } : share
              )
            );
          } else if (eventType === 'DELETE') {
            const deletedId = oldRecord?.id;
            if (deletedId) {
              setVaultShares(prev => prev.filter(share => share.id !== deletedId));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'publication_relations',
        },
        async (payload) => {
          debug('VaultContentContext', 'Received realtime update for publication relations:', payload);
          const eventType = payload.eventType;
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;

          // Check if this relation involves publications in the current vault
          const pubId = newRecord?.publication_id || oldRecord?.publication_id;
          const relatedPubId = newRecord?.related_publication_id || oldRecord?.related_publication_id;
          
          const isRelevant = publications.some(p => 
            p.id === pubId || 
            p.id === relatedPubId ||
            (p as any).original_publication_id === pubId ||
            (p as any).original_publication_id === relatedPubId
          );

          if (!isRelevant) return;

          if (eventType === 'INSERT') {
            setPublicationRelations(prev => {
              if (prev.some(r => r.id === newRecord.id)) {
                return prev;
              }
              return [...prev, newRecord as PublicationRelation];
            });
          } else if (eventType === 'UPDATE') {
            setPublicationRelations(prev =>
              prev.map(relation =>
                relation.id === newRecord.id ? { ...relation, ...newRecord } : relation
              )
            );
          } else if (eventType === 'DELETE') {
            const deletedId = oldRecord?.id;
            if (deletedId) {
              setPublicationRelations(prev => prev.filter(relation => relation.id !== deletedId));
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`[VaultContentContext] Realtime subscription status: ${status}`, { currentVaultId, error: err });
        setIsRealtimeConnected(status === 'SUBSCRIBED');
        
        if (err) {
          console.error('[VaultContentContext] Realtime subscription error:', err);
        }
      });

    return () => {
      console.log('[VaultContentContext] Removing real-time channel', currentVaultId);
      setIsRealtimeConnected(false);
      supabase.removeChannel(channel);
    };
  }, [currentVaultId, user, publications, formatVaultPublication]);

  return (
    <VaultContentContext.Provider
      value={{
        currentVault,
        publications,
        tags,
        publicationTags,
        publicationRelations,
        vaultShares,
        loading,
        error,
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
      }}
    >
      {children}
    </VaultContentContext.Provider>
  );
}

export function useVaultContent() {
  const context = useContext(VaultContentContext);
  if (context === undefined) {
    throw new Error('useVaultContent must be used within a VaultContentProvider');
  }
  return context;
}