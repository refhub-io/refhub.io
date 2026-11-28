import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag, PublicationRelation, VaultShare } from '@/types/database';
import { handleError } from '@/lib/toast';
import { debug, warn, error as logError } from '@/lib/logger';
import { clearPageCache, getPageCache, setPageCache } from '@/lib/pageCache';
import { ownerTag } from '@/lib/cacheOwner';
import { syncDrivePdfAsset } from '@/lib/pdfAssets';
import { formatVaultPublication } from '@/lib/formatVaultPublication';
import { buildPdfAssetsMap, fetchVaultContentRows } from '@/lib/vaultContent';

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
  pdfAssetsMap: Record<string, string | null>;
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
  updateCurrentVault: (vault: Vault) => void;
  // New methods for optimistic updates
  refreshVaultContent: () => Promise<void>;
  isRealtimeConnected: boolean;
  // Last activity tracking
  lastActivity: LastActivityInfo | null;
  updateLastActivity: (type: ActivityType, userId: string | null) => void;
  // PDF assets
  pdfAssetsMap: Record<string, string | null>;
  updatePdfAsset: (vaultPublicationId: string, url: string | null) => Promise<void>;
}

const VaultContentContext = createContext<VaultContentContextType | undefined>(undefined);

interface VaultContentProviderProps {
  children: ReactNode;
}

export function VaultContentProvider({ children }: VaultContentProviderProps) {
  const { user } = useAuth();
  // The user's id, read when a fetch runs. Fetches start on visits (visitNonce), not on every new
  // user object: the auth state hands over a new one with the same id on each token refresh, and
  // several while a session restores, and each one used to start another fetch. A change of user
  // still counts as a visit, since setCurrentVaultId depends on the id and VaultDetail calls it
  // again; that call is also what clears the previous user's content.
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  const userId = user?.id;
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
  const [pdfAssetsMap, setPdfAssetsMap] = useState<Record<string, string | null>>({});

  const [currentVaultId, setCurrentVaultIdState] = useState<string | null>(null);
  // Bumped on every setCurrentVaultId call, including revisits to the same
  // vault. currentVaultId alone doesn't change value on a revisit (React
  // bails out of the state update when the new value === the old one), so
  // without this the fetch-triggering effect below would never re-run and
  // the vault would keep showing whatever was last fetched this session --
  // stale relative to edits made elsewhere (e.g. from the All Papers view)
  // while the vault page wasn't mounted.
  const [visitNonce, setVisitNonce] = useState(0);

  // Stable ref to the latest publications array so the realtime subscription
  // callback can check relevance without causing the subscription to be torn
  // down and re-created whenever publications change.
  const publicationsRef = useRef<Publication[]>(publications);
  publicationsRef.current = publications;
  
  // Track when we made a local activity update to prevent realtime from overwriting it
  const lastLocalActivityUpdateRef = useRef<number>(0);
  
  // Cache for user profile names to avoid repeated lookups
  const userProfileCacheRef = useRef<Map<string, string>>(new Map());
  
  // Track if we have cached data for the current vault (to skip loading state)
  const hasCachedContentRef = useRef(false);

  // Always holds the vault id most recently requested via setCurrentVaultId,
  // updated synchronously (unlike currentVaultId state, which only takes
  // effect on the next render). fetchVaultContent compares against this
  // right before committing its result, so a slower, older fetch (e.g. from
  // rapidly switching vault A -> B) can't win a race and overwrite newer
  // state with vault A's data after vault B is already selected.
  const latestRequestedVaultIdRef = useRef<string | null>(null);

  const updateCurrentVault = useCallback((vault: Vault) => {
    setCurrentVault(vault);

    if (!currentVaultId) return;

    const cacheKey = `vault-content-${currentVaultId}` as const;
    const cached = getPageCache<VaultContentCache>(cacheKey, ownerTag(user?.id));
    // Once this vault's content has loaded, current state is the freshest copy (realtime and
    // recent fetches update it), so it wins; the cached arrays are only a fallback before then.
    // Preferring the cache used to put older rows back into it after every vault settings edit.
    const preferState = currentVault?.id === currentVaultId || !cached;
    setPageCache<VaultContentCache>(cacheKey, {
      currentVault: vault,
      publications: preferState ? publications : cached.publications,
      tags: preferState ? tags : cached.tags,
      publicationTags: preferState ? publicationTags : cached.publicationTags,
      publicationRelations: preferState ? publicationRelations : cached.publicationRelations,
      vaultShares: preferState ? vaultShares : cached.vaultShares,
      pdfAssetsMap: preferState ? pdfAssetsMap : cached.pdfAssetsMap,
    }, ownerTag(user?.id));
  }, [currentVaultId, currentVault, publications, tags, publicationTags, publicationRelations, vaultShares, pdfAssetsMap, user?.id]);
  
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


  const updatePdfAsset = useCallback(async (vaultPublicationId: string, url: string | null) => {
    if (!user) return;

    // Optimistic update
    const previousUrl = pdfAssetsMap[vaultPublicationId];
    setPdfAssetsMap(prev => ({ ...prev, [vaultPublicationId]: url || null }));

    const publication = publications.find(p => p.id === vaultPublicationId);
    const publicationId = publication?.original_publication_id ?? null;

    try {
      // Also fans out to the canonical publication and every sibling vault
      // copy of the same paper in the user's other vaults, matching how
      // bibliographic fields already propagate.
      await syncDrivePdfAsset(supabase, {
        userId: user.id,
        publicationId,
        storedPdfUrl: url || null,
        originVaultPublicationId: vaultPublicationId,
      });
    } catch (error) {
      // Roll back optimistic update
      setPdfAssetsMap(prev => ({ ...prev, [vaultPublicationId]: previousUrl ?? null }));
      throw error;
    }
  }, [pdfAssetsMap, publications, user]);

  // Fetch vault content - extracted as a reusable function
  const fetchVaultContent = useCallback(async () => {
    const userId = userIdRef.current;
    if (!currentVaultId || !userId) {
      debug('VaultContentContext', 'Skipping fetch - conditions not met', { hasId: !!currentVaultId, hasUser: !!userId });
      return;
    }

    // Captured once per invocation -- this is what we compare against
    // latestRequestedVaultIdRef.current below to detect staleness, not the
    // (potentially since-changed) currentVaultId closed-over variable.
    const requestedVaultId = currentVaultId;
    const isStale = () => latestRequestedVaultIdRef.current !== requestedVaultId;

    debug('VaultContentContext', 'Starting fetch for vault:', currentVaultId, 'hasCached:', hasCachedContentRef.current);
    // Only show loading if we don't have cached data for this vault
    if (!hasCachedContentRef.current) {
      setLoading(true);
    }
    setError(null);

    try {
      // The whole vault in one round trip (#258). It doesn't wait for an access check: row-level
      // security scopes the call, so a vault the user can't read comes back empty, and
      // VaultDetail's own check decides what the page shows. A second check here repeated that
      // one and held the content back until it finished.
      const content = await fetchVaultContentRows(supabase, requestedVaultId);

      if (isStale()) {
        // A newer switch (e.g. rapid vault-hopping via keybinds) has already
        // moved past the vault this fetch was for. Discard the result
        // instead of clobbering whatever the newer, still-in-flight or
        // already-resolved fetch has shown.
        debug('VaultContentContext', 'Discarding stale fetch result for', requestedVaultId, 'latest requested is', latestRequestedVaultIdRef.current);
        return;
      }

      const cacheKey = `vault-content-${requestedVaultId}` as const;
      if (!content.vault) {
        // The user can't read this vault, or it's gone: nothing to show or keep.
        clearPageCache(cacheKey);
        setCurrentVault(null);
        setPublications([]);
        setTags([]);
        setPublicationTags([]);
        setPublicationRelations([]);
        setVaultShares([]);
        setPdfAssetsMap({});
        return;
      }

      const vaultPublications = content.vault_publications;
      // Convert vault publications to the same format as original publications
      const formattedVaultPublications = vaultPublications.map(formatVaultPublication);
      const pdfAssets = buildPdfAssetsMap(formattedVaultPublications, content.pdf_assets);

      // Find the most recently updated publication to set initial lastActivity
      let mostRecentActivity: { timestamp: string; updatedBy: string | null } | null = null;
      if (vaultPublications.length > 0) {
        const sorted = [...vaultPublications].sort((a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        const mostRecent = sorted[0];
        if (mostRecent) {
          mostRecentActivity = {
            timestamp: mostRecent.updated_at,
            updatedBy: mostRecent.updated_by || mostRecent.created_by || null,
          };
        }
      }

      // Batch state updates to reduce re-renders
      setCurrentVault(content.vault);
      setPublications(formattedVaultPublications);
      setPdfAssetsMap(pdfAssets);
      setTags(content.tags);
      setPublicationTags(content.publication_tags);
      setPublicationRelations(content.publication_relations);
      setVaultShares(content.vault_shares);

      // Save to cache for instant restore when switching back
      setPageCache<VaultContentCache>(cacheKey, {
        currentVault: content.vault,
        publications: formattedVaultPublications,
        tags: content.tags,
        publicationTags: content.publication_tags,
        publicationRelations: content.publication_relations,
        vaultShares: content.vault_shares,
        pdfAssetsMap: pdfAssets,
      }, ownerTag(userId));

      // Set initial lastActivity based on most recently updated publication
      // Now uses updated_by field if available to show who made the last update
      // Only set if we don't already have a more recent local activity
      if (mostRecentActivity && Date.now() - lastLocalActivityUpdateRef.current > 2000) {
        const activity = mostRecentActivity;
        // Who made the last update is decorative, so the vault doesn't wait for the name.
        void (activity.updatedBy ? getUserDisplayName(activity.updatedBy) : Promise.resolve(null)).then((userName) => {
          if (isStale() || Date.now() - lastLocalActivityUpdateRef.current <= 2000) return;
          setLastActivity({
            timestamp: activity.timestamp,
            userId: activity.updatedBy,
            userName,
            type: 'publication_updated', // We don't know the actual type, default to updated
          });
        }, () => {});
      }
      
      debug('VaultContentContext', 'Completed fetch, all state updated');
    } catch (err) {
      if (isStale()) {
        debug('VaultContentContext', 'Discarding stale fetch error for', requestedVaultId);
        return;
      }
      // On error, show toast but keep existing data (graceful degradation). The ref holds the
      // current list; this callback's own `publications` would be the stale one it closed over.
      const hasData = publicationsRef.current.length > 0;
      const message = handleError(err, 'loading vault content', hasData);
      // Only set error state if we have no cached data
      if (!hasData) {
        setError(message);
      }
    } finally {
      // Only the fetch for the currently-selected vault should control the
      // loading flag -- otherwise a slow, abandoned fetch resolving after a
      // newer one has already started could flip loading off mid-flight for
      // the vault actually being shown.
      if (!isStale()) {
        setLoading(false);
      }
      debug('VaultContentContext', 'Loading set to false');
    }
  }, [currentVaultId, getUserDisplayName]);

  // Refresh function that can be called externally
  const refreshVaultContent = useCallback(async () => {
    await fetchVaultContent();
  }, [fetchVaultContent]);

  // The latest fetchVaultContent, so the realtime channel can catch up without re-subscribing.
  const fetchVaultContentRef = useRef(fetchVaultContent);
  fetchVaultContentRef.current = fetchVaultContent;

  // Fetch vault content when vaultId changes, or on every revisit of the
  // same vault (visitNonce) -- see the comment on visitNonce above. A
  // change of user is a revisit too: see userIdRef.
  useEffect(() => {
    debug('VaultContentContext', 'Effect triggered', { currentVaultId, hasUser: !!userIdRef.current });
    if (!currentVaultId || !userIdRef.current) {
      return;
    }
    fetchVaultContent();
  }, [currentVaultId, visitNonce, fetchVaultContent]);

  const setCurrentVaultId = useCallback((vaultId: string) => {
    // Set synchronously, before any state updates below, so an in-flight
    // fetchVaultContent for a previous vault sees the new id immediately
    // (via its isStale() check) rather than only after this render commits.
    latestRequestedVaultIdRef.current = vaultId;

    // Check cache first for instant restore
    const cacheKey = `vault-content-${vaultId}` as const;
    const cached = getPageCache<VaultContentCache>(cacheKey, ownerTag(user?.id));

    if (cached) {
      debug('VaultContentContext', 'Restoring vault content from cache:', vaultId);
      hasCachedContentRef.current = true;
      setCurrentVault(cached.currentVault);
      setPublications(cached.publications);
      setTags(cached.tags);
      setPublicationTags(cached.publicationTags);
      setPublicationRelations(cached.publicationRelations);
      setVaultShares(cached.vaultShares);
      setPdfAssetsMap(cached.pdfAssetsMap);
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
      setPdfAssetsMap({});
    }

    setCurrentVaultIdState(vaultId);
    // Force the fetch effect to re-run even if vaultId is unchanged from
    // last time (revisiting the same vault after editing it elsewhere).
    setVisitNonce(n => n + 1);
  }, [user?.id]);

  // Set up a single real-time subscription for all vault-related changes. It depends on the user's
  // id, not the user object: the auth state hands over a new object on every token refresh, and
  // re-subscribing then dropped whatever changed in between.
  useEffect(() => {
    if (!currentVaultId || !userId) {
      debug('VaultContentContext', 'Skipping real-time subscription - no vaultId or user', { currentVaultId: !!currentVaultId, user: !!userId });
      setIsRealtimeConnected(false);
      return;
    }

    debug('VaultContentContext', 'Setting up unified real-time subscription for vault', currentVaultId);
    let joined = false;

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newRecord = payload.new as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oldRecord = payload.old as any;

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
            // Update existing publication. Merge onto the existing record before
            // formatting: Postgres's logical replication can omit unchanged
            // TOASTed columns (e.g. large `notes`) from the payload when a
            // different column is updated, and formatting the raw payload alone
            // would wipe those fields locally until the next full fetch.
            setPublications(prev =>
              prev.map(pub =>
                pub.id === newRecord.id
                  ? formatVaultPublication({ ...pub, ...newRecord })
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
          // Only catches vault-scoped tag changes -- a user-scoped tag (see
          // the fetch above) edited elsewhere while this vault is open won't
          // live-update here; Supabase Realtime's filter string can't express
          // "vault_id = X OR user_id = Y", and a second subscription just for
          // that is more than this is worth right now. Known, minor gap.
          table: 'tags',
          filter: `vault_id=eq.${currentVaultId}`,
        },
        async (payload) => {
          debug('VaultContentContext', 'Received realtime update for tags:', payload);
          const eventType = payload.eventType;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newRecord = payload.new as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oldRecord = payload.old as any;

          if (eventType === 'INSERT') {
            setTags(prev => {
              // Dedupe by ID (skip if already present)
              if (prev.some(t => t.id === newRecord.id)) {
                return prev;
              }
              // Dedupe by name within same vault to handle race between
              // optimistic create (temp ID) and realtime INSERT (server ID)
              const tempMatch = prev.find(t =>
                t.name === newRecord.name &&
                t.vault_id === newRecord.vault_id &&
                t.id.startsWith('temp_')
              );
              if (tempMatch) {
                // Replace the temp tag with the real server record
                return prev.map(t => t.id === tempMatch.id ? (newRecord as Tag) : t);
              }
              // Also dedupe by exact name+vault to prevent duplicates from concurrent clients
              const nameMatch = prev.find(t =>
                t.name.toLowerCase() === newRecord.name.toLowerCase() &&
                t.vault_id === newRecord.vault_id &&
                !t.id.startsWith('temp_')
              );
              if (nameMatch) {
                // Keep the existing one, ignore the duplicate
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newRecord = payload.new as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oldRecord = payload.old as any;

          // Check if this publication tag belongs to a publication in the current vault
          const vaultPublicationId = newRecord?.vault_publication_id || oldRecord?.vault_publication_id;
          
          if (vaultPublicationId) {
            // Verify the publication belongs to this vault
            const belongsToVault = publicationsRef.current.some(p => p.id === vaultPublicationId);
            if (!belongsToVault) {
              return; // Not relevant to this vault
            }
          } else {
            // For original publication tags, check if relevant to this vault
            const publicationId = newRecord?.publication_id || oldRecord?.publication_id;
            if (!publicationId) return;
            
            // Check if any vault publication references this original
            const isRelevant = publicationsRef.current.some(p => 
              p.original_publication_id === publicationId
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newRecord = payload.new as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newRecord = payload.new as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oldRecord = payload.old as any;

          // Check if this relation involves publications in the current vault
          const pubId = newRecord?.publication_id || oldRecord?.publication_id;
          const relatedPubId = newRecord?.related_publication_id || oldRecord?.related_publication_id;
          
          const isRelevant = publicationsRef.current.some(p => 
            p.id === pubId || 
            p.id === relatedPubId ||
            p.original_publication_id === pubId ||
            p.original_publication_id === relatedPubId
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
        setIsRealtimeConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          // Changes made while the channel was down are never delivered, so after a re-join
          // (the connection dropped and came back) the vault is fetched again to catch up.
          if (joined) void fetchVaultContentRef.current();
          joined = true;
        }
        if (err) {
          logError('VaultContentContext', 'Realtime subscription error:', err);
        }
      });

    return () => {
      setIsRealtimeConnected(false);
      supabase.removeChannel(channel);
    };
  }, [currentVaultId, userId, updateLastActivity]);

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
        updateCurrentVault,
        refreshVaultContent,
        isRealtimeConnected,
        lastActivity,
        updateLastActivity,
        pdfAssetsMap,
        updatePdfAsset,
      }}
    >
      {children}
    </VaultContentContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVaultContent() {
  const context = useContext(VaultContentContext);
  if (context === undefined) {
    throw new Error('useVaultContent must be used within a VaultContentProvider');
  }
  return context;
}
