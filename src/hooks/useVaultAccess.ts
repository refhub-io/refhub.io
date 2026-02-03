import { useEffect, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import { VaultVisibility, VaultRole } from '../types/vault-extensions';

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

export const useVaultAccess = (vaultSlug: string) => {
  const [result, setResult] = useState<VaultAccessResult>({
    canView: false,
    canEdit: false,
    isOwner: false,
    permission: null,
    accessStatus: 'loading',
    vault: null,
    userRole: null,
    error: null,
  });

  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  useEffect(() => {
    console.log('[useVaultAccess] Effect triggered with vaultSlug:', vaultSlug, 'and refreshKey:', refreshKey);
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
        setResult(prev => ({ ...prev, accessStatus: 'loading', error: null }));

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
            console.log('[useVaultAccess] Vault not accessible via RLS, trying metadata function');
            const { data: metadata, error: metadataError } = await supabase
              .rpc('get_vault_metadata', { vault_id: vaultSlug });

            if (metadata && metadata.length > 0) {
              console.log('[useVaultAccess] Got vault metadata:', metadata[0]);
              vaultData = metadata[0];
            } else {
              console.log('[useVaultAccess] No metadata available, vault might not exist or is private');
              // Vault truly doesn't exist or is private
              vaultNotFound = true;
            }
          } else {
            // Some other error occurred (network, etc.)
            console.error('Non-PGRST116 error occurred:', error);
            // Continue with the flow instead of returning early
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
            console.log('[useVaultAccess] Updating result to granted for owner');
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

        console.log('[useVaultAccess] Share check result:', { hasShare: !!share, shareError: shareError?.message });

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

          console.log('[useVaultAccess] Access request check:', { hasRequest: !!request, requestStatus: request?.status, requestError: requestError?.message });

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
              console.log('[useVaultAccess] Visibility check:', { visibility });
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

        console.log('[useVaultAccess] Updating result with final access check', { 
          canView, 
          canEdit, 
          accessStatus, 
          hasVaultData: !!vaultData,
          visibility: vaultData ? (vaultData as any).visibility : 'N/A',
          hasShare: !!share,
          userRole
        });
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
        console.error('Error checking vault access:', error);
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

// Helper function to approve/deny access request
export const updateAccessRequest = async (
  requestId: string,
  status: 'approved' | 'rejected'
) => {
  const { data, error } = await supabase
    .from('vault_access_requests')
    .update({ status } as any)
    .eq('id', requestId)
    .select()
    .single();

  if (!error && status === 'approved') {
    // Create share for approved request
    const { data: request } = await supabase
      .from('vault_access_requests')
      .select('vault_id, requester_id, requester_name, requester_email')
      .eq('id', requestId)
      .single();

    if (request) {
      // Get the profile information for the user being shared with
      let sharedWithName = null;
      if ((request as any).requester_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, email, username')
          .eq('user_id', (request as any).requester_id)
          .single();

        sharedWithName = profile?.display_name || profile?.username || profile?.email;
      }

      await supabase
        .from('vault_shares')
        .insert({
          vault_id: (request as any).vault_id,
          shared_with_user_id: (request as any).requester_id,
          shared_with_email: (request as any).requester_email,
          shared_with_name: sharedWithName || (request as any).requester_name, // Store the display name
          shared_by: (await supabase.auth.getUser()).data.user?.id,
          role: 'viewer', // Using new role field
        } as any);
    }
  }

  return { data, error };
};

// Helper function to share vault with user
export const shareVault = async (
  vaultId: string,
  sharedBy: string,
  sharedWithUserId: string | null,
  sharedWithEmail: string | null,
  role: 'editor' | 'viewer'
) => {
  // Get the profile information for the user being shared with
  let sharedWithName = null;
  if (sharedWithUserId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, email, username')
      .eq('user_id', sharedWithUserId)
      .single();

    sharedWithName = profile?.display_name || profile?.username || profile?.email;
  }

  const { data, error } = await supabase
    .from('vault_shares')
    .insert({
      vault_id: vaultId,
      shared_with_user_id: sharedWithUserId,
      shared_with_email: sharedWithEmail,
      shared_with_name: sharedWithName, // Store the display name
      shared_by: sharedBy,
      role, // Using new role field
    } as any)
    .select()
    .single();

  return { data, error };
};

// Helper function to remove vault share
export const removeVaultShare = async (shareId: string) => {
  // First, get the share details to know which user and vault
  const { data: shareData, error: fetchError } = await supabase
    .from('vault_shares')
    .select('vault_id, shared_with_user_id')
    .eq('id', shareId)
    .single();

  if (fetchError) {
    return { data: null, error: fetchError };
  }

  // Delete the share
  const { data, error } = await supabase
    .from('vault_shares')
    .delete()
    .eq('id', shareId);

  if (error) {
    return { data, error };
  }

  // Also delete any access requests from this user for this vault
  if (shareData?.shared_with_user_id && shareData?.vault_id) {
    await supabase
      .from('vault_access_requests')
      .delete()
      .eq('vault_id', shareData.vault_id)
      .eq('requester_id', shareData.shared_with_user_id);
  }

  return { data, error };
};

// Helper function to update share role
export const updateVaultShareRole = async (shareId: string, role: 'editor' | 'viewer') => {
  const { data, error } = await supabase
    .from('vault_shares')
    .update({ role } as any)
    .eq('id', shareId)
    .select()
    .single();

  return { data, error };
};

// Helper function to get vault shares
export const getVaultShares = async (vaultId: string) => {
  const { data, error } = await supabase
    .from('vault_shares')
    .select('*')
    .eq('vault_id', vaultId);

  return { data, error };
};

// Helper function to get vault access requests
export const getVaultAccessRequests = async (vaultId: string) => {
  const { data, error } = await supabase
    .from('vault_access_requests')
    .select(`
      *,
      profiles:requester_id(
        display_name,
        email,
        avatar_url
      )
    `)
    .eq('vault_id', vaultId)
    .in('status', ['pending', 'approved', 'rejected']);

  return { data, error };
};