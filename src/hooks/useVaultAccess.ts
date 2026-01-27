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

        // Try to get vault by checking related tables first (due to RLS restrictions on protected vaults)
        // Check if vault exists by checking related tables that might have more permissive RLS
        const { count: paperCount } = await supabase
          .from('vault_papers')
          .select('*', { count: 'exact', head: true })
          .eq('vault_id', vaultSlug)
          .limit(1);

        const { count: requestCount } = await supabase
          .from('vault_access_requests')
          .select('*', { count: 'exact', head: true })
          .eq('vault_id', vaultSlug)
          .limit(1);

        // If there are papers or requests for this vault ID, the vault exists
        const vaultExists = paperCount > 0 || requestCount > 0;

        let vaultData = null;
        let vaultError = null;

        if (vaultExists) {
          // Try to get the vault data (may fail for protected vaults without access)
          const { data: vault, error } = await supabase
            .from('vaults')
            .select('*')
            .eq('id', vaultSlug)
            .single();

          if (error && error.code !== 'PGRST116') {
            // Real error occurred
            setResult(prev => ({
              ...prev,
              accessStatus: 'denied',
              error: `Database error: ${error.message}`,
            }));
            return;
          }

          vaultData = vault || null;
        } else {
          // Vault likely doesn't exist, try direct fetch to confirm
          const { data: vault, error } = await supabase
            .from('vaults')
            .select('*')
            .eq('id', vaultSlug)
            .single();

          if (error && error.code !== 'PGRST116') {
            // Real error occurred
            setResult(prev => ({
              ...prev,
              accessStatus: 'denied',
              error: `Database error: ${error.message}`,
            }));
            return;
          }

          if (error && error.code === 'PGRST116') {
            // Vault definitely doesn't exist
            setResult(prev => ({
              ...prev,
              accessStatus: 'denied',
              error: 'Vault not found',
            }));
            return;
          }

          vaultData = vault;
        }

        if (!vaultData) {
          setResult(prev => ({
            ...prev,
            accessStatus: 'denied',
            error: 'Vault not found',
          }));
          return;
        }

        if (!mounted) return;

        // Check if user is owner
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

        // If no user, check if vault is public
        if (!user) {
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
        }

        // Check for explicit share by user ID first
        let { data: share, error: shareError } = await supabase
          .from('vault_shares')
          .select('*')
          .eq('vault_id', vaultData.id)
          .eq('shared_with_user_id', user.id)
          .single();

        // If no share found by user ID, check by email
        if (!share && !shareError) {
          const { data: emailShare, error: emailShareError } = await supabase
            .from('vault_shares')
            .select('*')
            .eq('vault_id', vaultData.id)
            .eq('shared_with_email', user.email)
            .single();

          share = emailShare;
          shareError = emailShareError;
        }

        if (!mounted) return;

        let userRole: 'owner' | 'editor' | 'viewer' | null = null;
        let canView = false;
        let canEdit = false;
        let accessStatus: 'granted' | 'denied' | 'pending' | 'requestable' = 'denied';

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
            .eq('vault_id', vaultData.id)
            .eq('requester_id', user.id)
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
            // No share, no request - check vault visibility
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
          error: null,
        }));

      } catch (error) {
        console.error('Error checking vault access:', error);
        if (mounted) {
          setResult(prev => ({
            ...prev,
            accessStatus: 'denied',
            error: error instanceof Error ? error.message : 'Unknown error',
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