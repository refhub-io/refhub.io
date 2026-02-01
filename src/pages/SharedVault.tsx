import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Vault, Tag, PublicationTag } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useVaultFavorites } from '@/hooks/useVaultFavorites';
import { useVaultFork } from '@/hooks/useVaultFork';
import { useSharedVaultOperations } from '@/hooks/useSharedVaultOperations';
import { Sidebar } from '@/components/layout/Sidebar';
import { PublicationList } from '@/components/publications/PublicationList';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Lock,
  ShieldCheck,
  BookOpen,
  Heart,
  GitFork,
  Clock
} from 'lucide-react';
import VaultAccessBadge from '../components/vaults/VaultAccessBadge';
import { requestVaultAccess } from '@/hooks/useVaultAccess';

export default function SharedVault() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { profile } = useProfile();
  const { isFavorite, toggleFavorite } = useVaultFavorites();
  const { forkVault } = useVaultFork();
  const navigate = useNavigate();

  const [vault, setVault] = useState<Vault | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [publicationTags, setPublicationTags] = useState<PublicationTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [userPermission, setUserPermission] = useState<'viewer' | 'editor' | null>(null);

  // Combined state update to prevent timing issues
  const updateAccessState = (updates: {
    accessDenied?: boolean;
    isOwner?: boolean;
    userPermission?: 'viewer' | 'editor' | null;
  }) => {
    if (updates.accessDenied !== undefined) setAccessDenied(updates.accessDenied);
    if (updates.isOwner !== undefined) setIsOwner(updates.isOwner);
    if (updates.userPermission !== undefined) setUserPermission(updates.userPermission);
  };
  const [forking, setForking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  // Initialize the shared vault operations hook for optimistic updates
  const sharedVaultOps = useSharedVaultOperations({
    vaultId: slug || null,
    userId: user?.id || null,
    canEdit: userPermission === 'editor',
    publications,
    setPublications,
    tags,
    setTags,
    publicationTags,
    setPublicationTags,
  });

  // Compute access status for render
  const hasAccess = vault && (vault.visibility === 'public' || isOwner || (user && vault.user_id === user.id));


  const handleFavorite = async () => {
    if (!user || !vault) return;

    const success = await toggleFavorite(vault.id);
    if (success) {
      toast({
        title: isFavorite(vault.id) ? 'removed_from_favorites' : 'added_to_favorites ❤️',
      });
    }
  };

  const handleFork = async () => {
    if (!user || !vault) {
      toast({
        title: 'sign_in_required',
        description: 'Please sign in to fork this vault.',
        variant: 'destructive',
      });
      return;
    }

    setForking(true);
    const newVault = await forkVault(vault);
    setForking(false);

    if (newVault) {
      navigate('/dashboard');
      toast({
        title: 'fork_success',
        description: 'The vault has been added to your collection.',
      });
    }
  };

  const handleCreateTag = async (name: string, parentId?: string): Promise<Tag | null> => {
    if (!user || !vault?.id || userPermission !== 'editor') return null; // Only allow creating tags if user has edit permission

    // Use the optimistic update hook for creating tags
    const result = await sharedVaultOps.createTag(name, parentId);
    
    if (!result.success) {
      // Error toast is already shown by the hook
      return null;
    }
    
    return result.data || null;
  };

  const handleUpdateTag = async (tagId: string, updates: Partial<Tag>): Promise<Tag | null> => {
    if (!user || userPermission !== 'editor') return null; // Only allow updating tags if user has edit permission

    // Use the optimistic update hook for updating tags
    const result = await sharedVaultOps.updateTag(tagId, updates);
    
    if (!result.success) {
      // Error toast is already shown by the hook
      return null;
    }
    
    return result.data || null;
  };

  const handleSavePublicationTags = async (publicationId: string, tagIds: string[]): Promise<void> => {
    if (!user || userPermission !== 'editor') return; // Only allow updating tags if user has edit permission

    // Use the optimistic update hook for updating publication tags
    const result = await sharedVaultOps.updatePublicationTags(publicationId, tagIds);
    
    if (!result.success) {
      // Error toast is already shown by the hook
      console.error('Error updating publication tags:', result.error);
    }
  };

  const fetchVault = useCallback(async () => {
    console.log('[SharedVault] fetchVault entry', { slug, user: !!user, isFetching });

    if (!slug || isFetching) {
      console.log('[SharedVault] fetchVault early return', {
        noSlug: !slug,
        isFetching
      });
      return;
    }

    setIsFetching(true);
    setLoading(true);
    setNotFound(false);
    setAccessDenied(false);
    // Don't reset permission here - let it persist unless we find new data

    try {
      console.log('[SharedVault] fetchVault called', { slug, user: !!user });

      // First, check if the vault exists by checking related tables that might have more permissive RLS
      // This is needed because RLS prevents direct access to protected vaults unless shared
      let vaultData = null;
      let hasAccess = false;
      let permission: 'viewer' | 'editor' | null = null;

      // Check if user is authenticated
      if (user) {
        // Check if user has access via shares or approved requests first
        // Check for existing share with permission (by user_id or email)
        const { data: shareData, error: shareError } = await supabase
          .from('vault_shares')
          .select('vault_id, role')
          .or(`shared_with_user_id.eq.${user.id},shared_with_email.eq.${user.email}`)
          .eq('vault_id', slug)
          .maybeSingle();

        if (shareData) {
          hasAccess = true;
          permission = (shareData as any).role as 'viewer' | 'editor';
          setUserPermission(permission);

          // Now fetch the vault data since we know we have access
          const { data: vaultFromShare, error: vaultFromShareError } = await supabase
            .from('vaults')
            .select('*')
            .eq('id', shareData.vault_id)
            .single();

          if (vaultFromShareError) {
            console.log('[SharedVault] Error fetching vault after confirmed access', { vaultFromShareError });
            setNotFound(true);
            return;
          }

          vaultData = vaultFromShare;
        } else {
          // Check for approved request
          const { data: approvedRequest } = await supabase
            .from('vault_access_requests')
            .select('vault_id')
            .eq('vault_id', slug)
            .eq('requester_id', user.id)
            .eq('status', 'approved')
            .maybeSingle();

          if (approvedRequest) {
            hasAccess = true;
            permission = 'viewer';
            setUserPermission('viewer');

            // Now fetch the vault data since we know we have access
            const { data: vaultFromRequest, error: vaultFromRequestError } = await supabase
              .from('vaults')
              .select('*')
              .eq('id', approvedRequest.vault_id)
              .single();

            if (vaultFromRequestError) {
              console.log('[SharedVault] Error fetching vault after approved request', { vaultFromRequestError });
              // Don't set notFound here - the vault exists, we just might not have direct access yet
              // This can happen if the share wasn't created after approval
              // Try to get minimal vault info for display purposes
              const { data: minimalVaultData } = await supabase
                .from('vaults')
                .select('id, name, description, visibility, updated_at, color, user_id')
                .eq('id', approvedRequest.vault_id)
                .single();

              if (minimalVaultData) {
                vaultData = minimalVaultData;
              } else {
                // If we can't get any vault data at all, then it truly doesn't exist
                console.log('[SharedVault] Vault truly does not exist after approved request', { vaultFromRequestError });
                setNotFound(true);
                return;
              }
            }

            vaultData = vaultFromRequest;
          } else {
            // Check if it's a public vault (user can access public vaults)
            const { data: publicVaultData, error: publicVaultError } = await supabase
              .from('vaults')
              .select('*')
              .eq('id', slug)
              .eq('visibility', 'public')
              .single();

            if (publicVaultData) {
              vaultData = publicVaultData;
              hasAccess = true;
              permission = 'viewer';
              setUserPermission('viewer');
            } else {
              // Check if user is the owner (owners can always access their vaults)
              const { data: ownerVaultData, error: ownerVaultError } = await supabase
                .from('vaults')
                .select('*')
                .eq('id', slug)
                .eq('user_id', user.id)
                .single();

              if (ownerVaultData) {
                vaultData = ownerVaultData;
                hasAccess = true;
                // Owner permissions are handled separately
              } else {
                // For protected vaults, we need to check if the vault exists
                // Since RLS prevents direct access to protected vaults, we'll check related tables
                const { count: paperCount } = await supabase
                  .from('vault_papers')
                  .select('*', { count: 'exact', head: true })
                  .eq('vault_id', slug)
                  .limit(1);

                if (paperCount > 0) {
                  // Vault exists but user doesn't have access
                  console.log('[SharedVault] Protected vault exists but access denied');
                  hasAccess = false;

                  // Try to get minimal vault info - this might work for protected vaults
                  const { data: minimalVaultData } = await supabase
                    .from('vaults')
                    .select('id, name, description, visibility, updated_at, color, user_id')
                    .eq('id', slug)
                    .single();

                  if (minimalVaultData) {
                    vaultData = minimalVaultData;
                  } else {
                    // If we can't get vault data, create a minimal object
                    vaultData = {
                      id: slug,
                      user_id: '', // Will be populated when user gets access
                      name: 'Protected Vault',
                      description: 'This vault is protected. Request access to view its contents.',
                      color: '#6366f1',
                      visibility: 'protected',
                      public_slug: null,
                      category: null,
                      abstract: null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString()
                    } as Vault;
                  }
                } else {
                  // Check if vault exists at all by checking access requests
                  const { count: requestCount } = await supabase
                    .from('vault_access_requests')
                    .select('*', { count: 'exact', head: true })
                    .eq('vault_id', slug)
                    .limit(1);

                  if (requestCount > 0) {
                    // Vault exists but user doesn't have access
                    console.log('[SharedVault] Protected vault exists but access denied (via requests)');
                    hasAccess = false;

                    // Try to get minimal vault info
                    const { data: minimalVaultData } = await supabase
                      .from('vaults')
                      .select('id, name, description, visibility, updated_at, color, user_id')
                      .eq('id', slug)
                      .single();

                    if (minimalVaultData) {
                      vaultData = minimalVaultData;
                    } else {
                      // If we can't get vault data, create a minimal object
                      vaultData = {
                        id: slug,
                        user_id: '', // Will be populated when user gets access
                        name: 'Protected Vault',
                        description: 'This vault is protected. Request access to view its contents.',
                        color: '#6366f1',
                        visibility: 'protected',
                        public_slug: null,
                        category: null,
                        abstract: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                      } as Vault;
                    }
                  } else {
                    // Vault doesn't exist at all
                    console.log('[SharedVault] Vault does not exist');
                    setNotFound(true);
                    return;
                  }
                }
              }
            }
          }
        }
      } else {
        // User is not authenticated - only check for public vaults
        const { data: publicVaultData, error: publicVaultError } = await supabase
          .from('vaults')
          .select('*')
          .eq('id', slug)
          .eq('visibility', 'public')
          .single();

        if (publicVaultData) {
          vaultData = publicVaultData;
          hasAccess = true;
          permission = 'viewer';
          setUserPermission('viewer');
        } else {
          // For unauthenticated users, check if the vault exists by checking related tables
          // that might have more permissive RLS policies for existence checks
          const { count: paperCount } = await supabase
            .from('vault_papers')
            .select('*', { count: 'exact', head: true })
            .eq('vault_id', slug)
            .limit(1);

          if (paperCount > 0) {
            // Vault exists but user doesn't have access
            console.log('[SharedVault] Protected vault exists but access denied (unauthenticated user)');
            hasAccess = false;

            // Try to get minimal vault info - this might work for protected vaults
            const { data: minimalVaultData } = await supabase
              .from('vaults')
              .select('id, name, description, visibility, updated_at, color, user_id')
              .eq('id', slug)
              .single();

            if (minimalVaultData) {
              vaultData = minimalVaultData;
            } else {
              // If we can't get vault data, create a minimal object
              vaultData = {
                id: slug,
                user_id: '', // Will be populated when user gets access
                name: 'Protected Vault',
                description: 'This vault is protected. Request access to view its contents.',
                color: '#6366f1',
                visibility: 'protected',
                public_slug: null,
                category: null,
                abstract: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              } as Vault;
            }
          } else {
            // Check if vault exists at all by checking access requests
            const { count: requestCount } = await supabase
              .from('vault_access_requests')
              .select('*', { count: 'exact', head: true })
              .eq('vault_id', slug)
              .limit(1);

            if (requestCount > 0) {
              // Vault exists but user doesn't have access
              console.log('[SharedVault] Protected vault exists but access denied (via requests, unauthenticated user)');
              hasAccess = false;

              // Try to get minimal vault info
              const { data: minimalVaultData } = await supabase
                .from('vaults')
                .select('id, name, description, visibility, updated_at, color, user_id')
                .eq('id', slug)
                .single();

              if (minimalVaultData) {
                vaultData = minimalVaultData;
              } else {
                // If we can't get vault data, create a minimal object
                vaultData = {
                  id: slug,
                  user_id: '', // Will be populated when user gets access
                  name: 'Protected Vault',
                  description: 'This vault is protected. Request access to view its contents.',
                  color: '#6366f1',
                  visibility: 'protected',
                  public_slug: null,
                  category: null,
                  abstract: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                } as Vault;
              }
            } else {
              // Vault doesn't exist at all
              console.log('[SharedVault] Vault does not exist (unauthenticated user)');
              setNotFound(true);
              return;
            }
          }
        }
      }

      if (vaultData) {
        setVault(vaultData);
      }

      const ownerUser = user && vaultData && vaultData.user_id === user.id;
      const publicVault = vaultData && vaultData.visibility === 'public';

      console.log('[SharedVault] Initial access check', {
        isOwnerUser: ownerUser,
        publicVault,
        hasAccess,
        vaultUserId: vaultData?.user_id,
        currentUserId: user?.id
      });

      // State will be updated asynchronously, so we'll check after React batch
      setTimeout(() => {
        console.log('[SharedVault] Final access decision (after batch)', { hasAccess, userPermission, isOwner });
      }, 0);

      // If we reach here, check if user has access to the vault
      if (!hasAccess) {
        // If vault data exists but user doesn't have access, show access denied (request form)
        if (vaultData) {
          console.log('[SharedVault] Access denied - vault exists but no access');
          setAccessDenied(true);
          return;
        } else {
          // If no vault data and no access, it means vault doesn't exist
          console.log('[SharedVault] Vault does not exist and no access');
          setNotFound(true);
          return;
        }
      }

      setIsOwner(ownerUser);

      if (hasAccess) {
        console.log('[SharedVault] Fetching publications');
        // Increment view count
        await supabase.rpc('increment_vault_views', { vault_uuid: vaultData.id });

        let pubsData: Publication[] = [];
        // Get vault-specific copies
        const { data: vaultPublicationsData } = await supabase
          .from('vault_publications')
          .select('*')
          .eq('vault_id', vaultData.id)
          .order('updated_at', { ascending: false });

        // Convert vault publications to the same format as original publications
        pubsData = vaultPublicationsData.map(vp => ({
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
        }));

        if (pubsData) {
          setPublications(pubsData as Publication[]);
          console.log('[SharedVault] Publications loaded', pubsData.length);

          // Fetch tags - in the copy-based model with vault-specific tags, we need to map from vault publication IDs
          const vaultPubIds = pubsData.map(p => p.id).filter(id => id); // Use the vault-specific copy IDs
          const originalPubIds = pubsData.map(p => p.original_publication_id).filter(id => id); // Also get original IDs

          // Fetch tags for both vault-specific copies and original publications
          let pubTagsData = [];

          if (vaultPubIds.length > 0) {
            const { data: vaultTags, error: vaultTagsError } = await supabase
              .from('publication_tags')
              .select('*')
              .in('vault_publication_id', vaultPubIds);
            if (!vaultTagsError && vaultTags) {
              pubTagsData = [...pubTagsData, ...vaultTags];
            }
          }

          if (originalPubIds.length > 0) {
            const { data: originalTags, error: originalTagsError } = await supabase
              .from('publication_tags')
              .select('*')
              .in('publication_id', originalPubIds);
            if (!originalTagsError && originalTags) {
              pubTagsData = [...pubTagsData, ...originalTags];
            }
          }

          if (pubTagsData.length > 0) {
            setPublicationTags(pubTagsData);

            // Get the unique tag IDs from the publication tags
            const tagIds = [...new Set(pubTagsData.map(pt => pt.tag_id))];
            if (tagIds.length > 0) {
              const { data: tagsData } = await supabase
                .from('tags')
                .select('*')
                .in('id', tagIds);

              if (tagsData) {
                setTags(tagsData);
                console.log('[SharedVault] Tags loaded', tagsData.length);
              }
            }
          } else {
            // If no tags found, still initialize with empty arrays
            setPublicationTags([]);
            setTags([]);
          }
        }
      }
    } catch (error) {
      console.error('[SharedVault] fetch vault error', error);
      setNotFound(true);
    } finally {
      console.log('[SharedVault] fetchVault completed, setting loading to false');
      setLoading(false);
      setIsFetching(false);
    }
  }, [slug, user]);

  useEffect(() => {
    console.log('[SharedVault] useEffect triggered', { slug, user: !!user, loading, authLoading });

    if (!authLoading) {
      // Always fetch vault info regardless of authentication status
      // This allows unauthenticated users to see vault details and request access
      fetchVault();
    }
  }, [slug, user, authLoading, navigate]); // Removed fetchVault to prevent circular dependency

  // Check for pending access requests when user and slug are available
  useEffect(() => {
    console.log('[SharedVault] Checking for pending requests', { user: !!user, slug });
    if (user && slug) {
      const checkPendingRequest = async () => {
        const { data: existingRequest } = await supabase
          .from('vault_access_requests')
          .select('id, status')
          .eq('vault_id', slug)
          .eq('requester_id', user.id)
          .in('status', ['pending', 'approved'])
          .maybeSingle();

        console.log('[SharedVault] Pending request check result:', existingRequest);
        if (existingRequest) {
          if (existingRequest.status === 'pending') {
            console.log('[SharedVault] Setting hasPendingRequest to true');
            setHasPendingRequest(true);
            // Console warning for pending request
            console.log('%c⚠️ WARNING: Request is pending approval - check vault owner for status', 'color: orange; font-weight: bold;');
          } else if (existingRequest.status === 'approved') {
            console.log('[SharedVault] Setting hasPendingRequest to false');
            setHasPendingRequest(false);
            // The main fetchVault logic will handle access updates
          }
        } else {
          console.log('[SharedVault] No existing request, setting hasPendingRequest to false');
          setHasPendingRequest(false);
        }
      };

      checkPendingRequest();
    } else {
      console.log('[SharedVault] No user or slug, setting hasPendingRequest to false');
      setHasPendingRequest(false);
    }
  }, [user, slug]);

  // Debug: Log when userPermission changes
  useEffect(() => {
    console.log('[SharedVault] userPermission state changed:', userPermission);
  }, [userPermission]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex">
        <div className="w-72 lg:w-72 flex-shrink-0 hidden lg:block border-r border-border bg-muted/10" />

        <div className="flex-1 flex flex-col min-h-0 overflow-x-hidden">
          {/* Header with vault info and actions */}
          <header className="bg-card/50 backdrop-blur-xl border-b-2 border-border px-4 lg:px-8 py-4 shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-md bg-muted animate-pulse" />
                  <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-transparent bg-clip-text bg-muted-foreground animate-pulse">
                    Loading vault...
                  </h1>
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  <span className="text-transparent bg-clip-text bg-muted-foreground animate-pulse">
                    // loading publications...
                  </span>
                </p>
              </div>
            </div>

            {/* Search, filters and view settings skeleton */}
            <div className="flex items-center gap-3 mt-5 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground bg-muted rounded-full" />
                <div className="h-10 w-full pl-11 rounded-md border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-muted animate-pulse" />
              </div>

              <div className="h-9 w-32 rounded-md border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-muted animate-pulse" />

              <div className="h-9 w-9 rounded-md border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-muted animate-pulse" />

              <div className="h-9 w-32 rounded-md border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-muted animate-pulse" />
            </div>
          </header>

          {/* Publication list skeleton */}
          <div className="flex-1 overflow-y-auto scrollbar-thin overflow-x-hidden p-4 lg:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {[...Array(6)].map((_, idx) => (
                <div key={idx} className="border border-border rounded-lg p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-full mb-1"></div>
                  <div className="h-3 bg-muted rounded w-5/6 mb-3"></div>
                  <div className="flex gap-1">
                    <div className="h-4 bg-muted rounded w-12"></div>
                    <div className="h-4 bg-muted rounded w-16"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
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
              variant="outline"
              className="font-mono"
              onClick={() => navigate('/dashboard')}
            >
              back_to_dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto border-2 border-primary/30">
            <Lock className="w-10 h-10 text-primary" />
          </div>
          <p className="text-muted-foreground font-mono text-sm">// access_denied</p>
          <p className="text-muted-foreground font-mono text-sm">this_vault_is_private_you_need_permission</p>
          <div className="flex gap-4 justify-center">
            <Button
              onClick={async () => {
                console.log('[SharedVault] Request Access button clicked', { user: !!user, vault: !!vault, slug });
                if (!user) {
                  console.log('[SharedVault] User not authenticated, redirecting to login');
                  // If user is not authenticated, redirect to login page
                  localStorage.setItem('redirectAfterLogin', `/vault/${slug}`);
                  navigate('/auth');
                } else {
                  console.log('[SharedVault] User authenticated, sending access request');
                  // Send the access request directly instead of opening a modal
                  if (vault) {
                    // Check if user already has a pending request
                    const { data: existingRequest } = await supabase
                      .from('vault_access_requests')
                      .select('id, status')
                      .eq('vault_id', vault.id)
                      .eq('requester_id', user.id)
                      .in('status', ['pending', 'approved'])
                      .maybeSingle();

                    console.log('[SharedVault] Existing request check result:', existingRequest);
                    if (existingRequest) {
                      if (existingRequest.status === 'pending') {
                        console.log('[SharedVault] Request already pending');
                        toast({
                          title: 'request_already_pending',
                          description: 'You already have a pending access request for this vault.',
                          variant: 'default',
                        });
                        return;
                      } else if (existingRequest.status === 'approved') {
                        console.log('[SharedVault] Access already approved');
                        toast({
                          title: 'access_already_approved',
                          description: 'Your access has already been approved.',
                          variant: 'default',
                        });
                        // Refresh the vault data to update access status
                        fetchVault();
                        return;
                      }
                    }

                    // Create access request using the helper function
                    try {
                      const result = await requestVaultAccess(vault.id, user.id, ''); // Empty note

                      if (result.error) {
                        console.error('[SharedVault] Error creating access request:', result.error);
                        toast({
                          title: 'Error',
                          description: 'Failed to submit access request. Please try again.',
                          variant: 'destructive',
                        });
                      } else {
                        console.log('[SharedVault] Access request submitted successfully');
                        toast({
                          title: 'request_submitted',
                          description: 'Your access request has been submitted. The vault owner will be notified.',
                        });
                        // Update the pending request state
                        setHasPendingRequest(true);
                      }
                    } catch (error) {
                      console.error('[SharedVault] request access error:', error);
                      toast({
                        title: 'Error',
                        description: 'Something went wrong. Please try again.',
                        variant: 'destructive',
                      });
                    }
                  }
                }
              }}
              disabled={hasPendingRequest}
              className={`${hasPendingRequest ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-gradient-primary text-white shadow-lg hover:shadow-xl'} font-mono transition-all`}
            >
              {hasPendingRequest ? (
                <>
                  <Clock className="w-4 h-4 mr-2" />
                  request_pending
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  {user ? 'request_access' : 'sign_in_to_request_access'}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="font-mono"
              onClick={() => navigate('/dashboard')}
            >
              back_to_dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        vaults={[]}
        sharedVaults={[vault].filter(Boolean)}
        selectedVaultId={vault?.id || null}
        onSelectVault={() => {}}
        onCreateVault={() => {}}
        onEditVault={isOwner ? () => navigate('/dashboard') : undefined}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
        profile={profile}
        onEditProfile={() => {}}
      />

      <div className="flex-1 lg:pl-72 min-w-0">
        {/* Header with vault info and actions */}
        {vault && user && !accessDenied && (
          <div className="border-b border-border bg-card/50 backdrop-blur-xl">
            <div className="max-w-6xl mx-auto px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <VaultAccessBadge vaultId={vault?.id || ''} />
                    </div>
                    {vault.description && (
                      <p className="text-muted-foreground font-mono text-sm">
                        // {vault.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    last_sync // {formatTimeAgo(vault.updated_at)}
                  </span>
                  {!isOwner && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFavorite}
                      className={`font-mono ${isFavorite(vault.id) ? 'text-rose-500 border-rose-500/30' : ''}`}
                    >
                      <Heart className={`w-4 h-4 ${isFavorite(vault.id) ? 'fill-rose-500' : ''}`} />
                      <span className="ml-2">{isFavorite(vault.id) ? 'favorited' : 'favorite'}</span>
                    </Button>
                  )}
                  {!isOwner && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFork}
                      disabled={forking}
                      className="font-mono"
                    >
                      <GitFork className="w-4 h-4" />
                      <span className="ml-2">fork</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {vault && user && (
          <PublicationList
            publications={publications}
            tags={tags}
            vaults={[vault]}
            publicationTagsMap={(() => {
              // Create a map from vault publication IDs to tags
              const vaultPubTagsMap: Record<string, string[]> = {};
              publicationTags.forEach(pt => {
                // Use vault_publication_id if available, otherwise fall back to publication_id
                const vaultPubId = pt.vault_publication_id || pt.publication_id;
                if (!vaultPubTagsMap[vaultPubId]) vaultPubTagsMap[vaultPubId] = [];
                vaultPubTagsMap[vaultPubId].push(pt.tag_id);
              });

              // Create a map from publication IDs to tags
              const pubTagsMap: Record<string, string[]> = {};
              publications.forEach(pub => {
                // In the copy-based model, publications are vault-specific copies
                // Look up the tags using the vault publication ID
                pubTagsMap[pub.id] = vaultPubTagsMap[pub.id] || [];
              });

              return pubTagsMap;
            })()}
            relationsCountMap={{}}
            selectedVault={vault}
            onAddPublication={isOwner || userPermission === 'editor' ? () => {
              // Owners and editors can add publications
            } : undefined}
            onImportPublications={isOwner || userPermission === 'editor' ? () => {
              // Owners and editors can import publications
            } : undefined}
            onEditPublication={isOwner || userPermission === 'editor' ? (pub) => {
              // Editors can edit publications - would need to implement edit functionality
              toast({
                title: 'coming_soon',
                description: 'Edit functionality for shared vaults coming soon.',
                variant: 'default',
              });
            } : undefined}
            onDeletePublication={isOwner || userPermission === 'editor' ? () => {
              // Owners and editors can delete publications
              toast({
                title: 'coming_soon',
                description: 'Delete functionality for shared vaults coming soon.',
                variant: 'default',
              });
            } : undefined}
            onCreateTag={isOwner || userPermission === 'editor' ? handleCreateTag : undefined}
            canEditTags={isOwner || userPermission === 'editor'}
            onExportBibtex={(pubs) => {
              if (pubs.length > 0) {
                toast({ title: 'export_success ✨' });
              }
            }}
            onMobileMenuOpen={() => setIsMobileSidebarOpen(true)}
            onOpenGraph={userPermission ? () => {
              // Both editors and viewers can view the relationship graph
              toast({
                title: 'coming_soon',
                description: 'Relationship graph for shared vaults coming soon.',
                variant: 'default',
              });
            } : undefined}
            onEditVault={isOwner ? () => navigate('/dashboard') : undefined}
            onVaultUpdate={() => {}}
          />
        )}
      </div>

    </div>
  );
}
