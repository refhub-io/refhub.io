import { useEffect, useState, useRef } from 'react';
import { supabase } from '../integrations/supabase/client';
import { logger } from '../lib/logger';
import { VaultVisibility, VaultRole } from '../types/vault-extensions';
import { getPageCache, setPageCache, hasPageCache } from '../lib/pageCache';

interface VaultAccessResult {
  canView: boolean;
  canEdit: boolean;
  isOwner: boolean;
  permission: VaultRole | null;
  accessStatus: 'granted' | 'denied' | 'pending' | 'requestable' | 'loading';
  vault: any | null;
  userRole: VaultRole | null;
  error: string | null;
}

// Cache structure for vault access
interface VaultAccessCache {
  result: VaultAccessResult;
  userId?: string;
}

export const useVaultAccess = (vaultSlug: string) => {
  // Check for cached data before initializing state
  const cacheKey = `vault-access-${vaultSlug}` as const;
  const cachedData = vaultSlug ? getPageCache<VaultAccessCache>(cacheKey) : null;
  const hasCachedData = useRef(!!cachedData);
  
  const [result, setResult] = useState<VaultAccessResult>(
    cachedData?.result || {
      canView: false,
      canEdit: false,
      isOwner: false,
      permission: null,
      accessStatus: 'loading',
      vault: null,
      userRole: null,
      error: null,
    }
  );

  const [refreshKey, setRefreshKey] = useState(0);
  const [isSilentRefresh, setIsSilentRefresh] = useState(hasCachedData.current); // Start silent if cached
  
  // Restore from cache when vaultSlug changes (for switching between vaults)
  useEffect(() => {
    if (!vaultSlug) return;
    
    const cached = getPageCache<VaultAccessCache>(cacheKey);
    if (cached) {
      // Restore cached result immediately for instant UI update
      setResult(cached.result);
      setIsSilentRefresh(true); // Subsequent fetch should be silent
    } else {
      // No cache - reset to loading state with cleared data
      // This prevents showing old vault data while new vault loads
      setResult({
        canView: false,
        canEdit: false,
        isOwner: false,
        permission: null,
        accessStatus: 'loading',
        vault: null,
        userRole: null,
        error: null,
      });
      setIsSilentRefresh(false);
    }
  }, [vaultSlug, cacheKey]);

  // Regular refresh - shows loading state (for initial load or when user explicitly wants loading feedback)
  const refresh = () => {
    setIsSilentRefresh(false);
    setRefreshKey(prev => prev + 1);
  };

  // Silent refresh - updates data in background without showing loading state
  const silentRefresh = () => {
    setIsSilentRefresh(true);
    setRefreshKey(prev => prev + 1);
  };

  // Save to cache whenever access status is resolved (not loading)
  useEffect(() => {
    if (vaultSlug && result.accessStatus !== 'loading') {
      setPageCache<VaultAccessCache>(cacheKey, { result });
    }
  }, [vaultSlug, result, cacheKey]);

  useEffect(() => {
    let mounted = true;

    const checkAccess = async () => {
      if (!vaultSlug) {
        setResult(prev => ({
          ...prev,
          accessStatus: 'denied',
          error: 'No vault slug provided',
        }));
        return;
      }

      try {
        // Only show loading state if this is NOT a silent refresh
        if (!isSilentRefresh) {
          setResult(prev => ({ ...prev, accessStatus: 'loading', error: null }));
        }

        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError && userError.code !== 'PGRST116') {
          throw userError;
        }

        let vaultData = null;
        let vaultNotFound = false;

        // Try to get the vault data directly
        // Due to RLS, this may fail for protected vaults without access
        const { data: vault, error } = await supabase
          .from('vaults')
          .select('*')
          .eq('id', vaultSlug)
          .single();

        if (error) {
          // If we get an error, try to get basic metadata using the secure function
          // This only works for public/protected vaults and returns limited info
          if (error.code === 'PGRST116') {
            const { data: metadata, error: metadataError } = await supabase
              .rpc('get_vault_metadata', { vault_id: vaultSlug });

            if (metadata && metadata.length > 0) {
              vaultData = metadata[0];
            } else {
              // Vault truly doesn't exist or is private
              vaultNotFound = true;
            }
          } else {
            // Some other error occurred (network, etc.) — continue
          }
        } else {
          // Successfully retrieved vault data - vault exists
          vaultData = vault;
        }

        if (!mounted) return;

        // If vault was truly not found (private or doesn't exist), return denied
        if (vaultNotFound) {
          setResult(prev => ({
            ...prev,
            canView: false,
            canEdit: false,
            isOwner: false,
            permission: null,
            accessStatus: 'denied',
            vault: null,
            userRole: null,
            error: null,
          }));
          return;
        }

        // Check if user is owner (only if we have vault data)
        if (vaultData) {
          const isOwner = user?.id === vaultData.user_id;

          if (isOwner) {
            setResult(prev => ({
              ...prev,
              canView: true,
              canEdit: true,
              isOwner: true,
              permission: 'owner' as const,
              accessStatus: 'granted' as const,
              vault: vaultData,
              userRole: 'owner' as const,
              error: null,
            }));
            return;
          }
        }

        // If no user, check if vault is public or protected (only if we have vault data)
        if (!user) {
          if (vaultData) {
            const vaultWithVisibility = vaultData as any;
            const canView = vaultWithVisibility.visibility === 'public';
            const isProtected = vaultWithVisibility.visibility === 'protected';
            
            setResult(prev => ({
              ...prev,
              canView,
              canEdit: false,
              isOwner: false,
              permission: canView ? ('viewer' as const) : null,
              accessStatus: canView ? ('granted' as const) : isProtected ? ('requestable' as const) : ('denied' as const),
              vault: vaultData,
              userRole: null,
              error: null,
            }));
            return;
          } else {
            // If we don't have vault data and no user, we can't access it
            // But we shouldn't set an error yet - we should continue checking for access methods
            // We'll handle this case later in the flow
          }
        }

        // Check for shares and requests - we'll check these regardless of whether we have vault data
        let userRole: 'owner' | 'editor' | 'viewer' | null = null;
        let canView = false;
        let canEdit = false;
        let accessStatus: 'granted' | 'denied' | 'pending' | 'requestable' = 'denied';

        // Check for explicit share by user ID first
        let { data: share, error: shareError } = await supabase
          .from('vault_shares')
          .select('*')
          .eq('vault_id', vaultSlug)  // Use slug directly instead of vaultData.id
          .eq('shared_with_user_id', user?.id)
          .maybeSingle();  // Use maybeSingle to handle 0 or 1 results gracefully

        // If no share found by user ID, check by email
        if (!share && !shareError && user?.email) {
          const { data: emailShare, error: emailShareError } = await supabase
            .from('vault_shares')
            .select('*')
            .eq('vault_id', vaultSlug)  // Use slug directly
            .eq('shared_with_email', user.email)
            .maybeSingle();  // Use maybeSingle to handle 0 or 1 results gracefully

          share = emailShare;
          shareError = emailShareError;
        }

        if (!mounted) return;

        if (share && !shareError) {
          userRole = share.role;
          canView = true;
          canEdit = userRole === 'editor' || userRole === 'owner';
          accessStatus = 'granted';
        } else {
          // Check if user has requested access
          const { data: request, error: requestError } = await supabase
            .from('vault_access_requests')
            .select('status')
            .eq('vault_id', vaultSlug)  // Use slug directly
            .eq('requester_id', user?.id)
            .maybeSingle();  // Use maybeSingle - 0 rows is not an error

          if (!mounted) return;

          if (request && !requestError) {
            if (request.status === 'pending') {
              accessStatus = 'pending';
              // canView stays false for pending
            } else if (request.status === 'approved') {
              canView = true;
              accessStatus = 'granted';
              userRole = 'viewer';
            }
            // For rejected status, fall through to visibility check
          }
          
          // If no share AND (no request OR rejected request), check visibility
          if (!canView && accessStatus !== 'pending') {
            if (vaultData) {
              const visibility = (vaultData as any).visibility as VaultVisibility;
              if (visibility === 'public') {
                canView = true;
                accessStatus = 'granted';
                userRole = 'viewer';
              } else if (visibility === 'protected') {
                // Protected vault - user can see metadata but NOT content
                canView = false;  // EXPLICITLY set to false
                accessStatus = 'requestable';
              } else {
                // Private vault
                canView = false;
                accessStatus = 'denied';
              }
            } else {
              // No vault data, no share, no request - vault doesn't exist or is private
              canView = false;
              accessStatus = 'denied';
            }
          }
        }

        const permission = canView ? (userRole || 'viewer') : null;

        setResult(prev => ({
          ...prev,
          canView,
          canEdit,
          isOwner: false,
          permission: permission as 'owner' | 'editor' | 'viewer' | null,
          accessStatus,
          vault: vaultData,
          userRole,
          error: null, // Never set error - distinguish between vault existence and access rights
        }));

      } catch (error) {
        logger.error('useVaultAccess', 'Error checking vault access:', error);
        if (mounted) {
          // In case of a real error (network, etc.), we should retry or handle gracefully
          // For now, let's set to denied without an error message to avoid showing error to user
          // A more sophisticated approach would be to implement retry logic
          setResult(prev => ({
            ...prev,
            accessStatus: 'denied',
            error: null, // Don't show error to user - just indicate no access
          }));
        }
      }
    };

    checkAccess();

    return () => {
      mounted = false;
    };
  }, [vaultSlug, refreshKey]);

  // Set up realtime subscriptions for permission changes
  useEffect(() => {
    if (!result.vault?.id) return;

    const channels = [];

    // Subscribe to vault changes
    const vaultChannel = supabase
      .channel(`vault-${result.vault.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vaults',
          filter: `id=eq.${result.vault.id}`,
        },
        () => {
          refresh();
        }
      )
      .subscribe();
    channels.push(vaultChannel);

    // Subscribe to share changes
    const sharesChannel = supabase
      .channel(`vault-shares-${result.vault.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vault_shares',
          filter: `vault_id=eq.${result.vault.id}`,
        },
        () => {
          refresh();
        }
      )
      .subscribe();
    channels.push(sharesChannel);

    // Subscribe to access request changes
    const requestsChannel = supabase
      .channel(`vault-requests-${result.vault.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vault_access_requests',
          filter: `vault_id=eq.${result.vault.id}`,
        },
        () => {
          refresh();
        }
      )
      .subscribe();
    channels.push(requestsChannel);

    return () => {
      channels.forEach(channel => {
        supabase.removeChannel(channel);
      });
    };
  }, [result.vault?.id]);

  return {
    ...result,
    refresh,
    silentRefresh,
  };
};

// Helper function to request access to a protected vault
export const requestVaultAccess = async (
  vaultId: string,
  requesterId: string,
  note?: string
) => {
  // First, get the user's profile information to include in the request
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, email, username')
    .eq('user_id', requesterId)
    .single();

  const { data, error } = await supabase
    .from('vault_access_requests')
    .insert({
      vault_id: vaultId,
      requester_id: requesterId,
      requester_name: profile?.display_name || profile?.username,
      requester_email: profile?.email,
      note,
      status: 'pending',
    } as any)
    .select()
    .single();

  return { data, error };
};
