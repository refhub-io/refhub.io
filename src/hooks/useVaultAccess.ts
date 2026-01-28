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
          // If we get an error, we need to determine if it's because the vault doesn't exist
          // or because we don't have permission to access it

          // For now, let's assume that if we get a PGRST116 error (no rows returned), the vault doesn't exist
          // But we'll delay setting the error state and continue checking for access methods
          if (error.code === 'PGRST116') {
            // Vault might not exist, but let's continue checking for access methods
            // We'll only set vaultNotFound to true if we also can't find any access methods
          } else {
            // Some other error occurred (network, etc.)
            // Don't set error state immediately, continue checking for access methods
            console.error('Non-PGRST116 error occurred:', error);
            // Continue with the flow instead of returning early
          }
        } else {
          // Successfully retrieved vault data - vault exists
          vaultData = vault;
        }

        // We'll continue checking for access methods and only set the error if no access is found
        // If we couldn't get the vault data directly, we'll only set the error if we also can't find access methods
        // For now, we'll continue with the assumption that the vault exists and check for access methods

        if (!mounted) return;

        if (!mounted) return;

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

        // If no user, check if vault is public (only if we have vault data)
        if (!user) {
          if (vaultData) {
            const vaultWithVisibility = vaultData as any;
            const canView = vaultWithVisibility.visibility === 'public';
            setResult(prev => ({
              ...prev,
              canView,
              canEdit: false,
              isOwner: false,
              permission: canView ? ('viewer' as const) : null,
              accessStatus: canView ? ('granted' as const) : ('denied' as const),
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
          .single();

        // If no share found by user ID, check by email
        if (!share && !shareError && user?.email) {
          const { data: emailShare, error: emailShareError } = await supabase
            .from('vault_shares')
            .select('*')
            .eq('vault_id', vaultSlug)  // Use slug directly
            .eq('shared_with_email', user.email)
            .single();

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
            .single();

          if (!mounted) return;

          if (!requestError && request) {
            if (request.status === 'pending') {
              accessStatus = 'pending';
            } else if (request.status === 'approved') {
              canView = true;
              accessStatus = 'granted';
              userRole = 'viewer';
            }
          } else {
            // No share, no request found - if we have vault data, check visibility
            if (vaultData) {
              const visibility = (vaultData as any).visibility as VaultVisibility;
              if (visibility === 'public') {
                canView = true;
                accessStatus = 'granted';
                userRole = 'viewer';
              } else if (visibility === 'protected') {
                accessStatus = 'requestable';
              } else {
                accessStatus = 'denied';
              }
            } else {
              // No vault data, no share, no request - we need to determine if vault exists
              // Since we couldn't access it directly and found no access methods,
              // we'll assume the vault doesn't exist
              accessStatus = 'denied';
            }
          }
        }

        const permission = canView ? (userRole || 'viewer') : null;

        console.log('[useVaultAccess] Updating result with final access check', { canView, canEdit, accessStatus, hasVaultData: !!vaultData });
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
  const { data, error } = await supabase
    .from('vault_shares')
    .delete()
    .eq('id', shareId);

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
    .select(`
      *,
      profiles:shared_with_user_id(
        display_name,
        email,
        avatar_url
      )
    `)
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