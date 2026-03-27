type VaultPublicationIdentityFields = {
  id?: string;
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
) {
  const {
    id: _id,
    vault_id: _vaultId,
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
    original_publication_id: vaultPublication.original_publication_id || null,
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
