// Extended types for vault collaboration system
// These augment the auto-generated types

export type VaultVisibility = 'private' | 'public' | 'protected';
export type VaultRole = 'owner' | 'editor' | 'viewer';

export interface ExtendedVault {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  visibility: VaultVisibility;
  public_slug: string | null;
  category: string | null;
  abstract: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtendedVaultShare {
  id: string;
  vault_id: string;
  shared_with_email: string | null;
  shared_with_user_id: string | null;
  shared_by: string;
  role: VaultRole;
  created_at: string;
}

export interface VaultPaper {
  id: string;
  vault_id: string;
  publication_id: string;
  added_by: string;
  added_at: string;
}

// Helper functions for type-safe database operations
export const vaultHelpers = {
  // Create a vault share with proper typing
  createShare: (
    vaultId: string,
    sharedBy: string,
    options: {
      sharedWithUserId?: string;
      sharedWithEmail?: string;
      role: 'editor' | 'viewer';
    }
  ) => ({
    vault_id: vaultId,
    shared_by: sharedBy,
    shared_with_user_id: options.sharedWithUserId || null,
    shared_with_email: options.sharedWithEmail || null,
    role: options.role,
  } as const),

  // Create vault access request
  createAccessRequest: (
    vaultId: string,
    requesterId: string,
    note?: string
  ) => ({
    vault_id: vaultId,
    requester_id: requesterId,
    note: note || null,
    status: 'pending' as const,
  } as const),

  // Create vault paper relationship
  createVaultPaper: (
    vaultId: string,
    publicationId: string,
    addedBy: string
  ) => ({
    vault_id: vaultId,
    publication_id: publicationId,
    added_by: addedBy,
  } as const),
};