type VaultPublicationIdentityFields = {
  id?: string;
  user_id?: string;
  vault_id?: string;
  original_publication_id?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
  version?: number;
  [key: string]: unknown;
};

export function buildVaultPublicationCopyPayload(
  vaultPublication: VaultPublicationIdentityFields,
  targetVaultId: string,
  actorUserId: string,
  timestamp = new Date().toISOString(),
  originalPublicationId = vaultPublication.original_publication_id || null,
) {
  const {
    id: _id,
    user_id: _userId,
    vault_id: _vaultId,
    original_publication_id: _originalPublicationId,
    created_at: _createdAt,
    updated_at: _updatedAt,
    created_by: _createdBy,
    updated_by: _updatedBy,
    version: _version,
    ...publicationData
  } = vaultPublication;

  return {
    ...publicationData,
    vault_id: targetVaultId,
    original_publication_id: originalPublicationId,
    created_at: timestamp,
    updated_at: timestamp,
    created_by: actorUserId,
  };
}

type LastUpdatedPublication = {
  updated_by?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export function resolveLastUpdatedActivity(
  publication: LastUpdatedPublication | null | undefined,
  fallbackTimestamp: string,
) {
  return {
    actorId: publication?.updated_by || publication?.created_by || null,
    timestamp: publication?.updated_at || publication?.created_at || fallbackTimestamp,
  };
}
