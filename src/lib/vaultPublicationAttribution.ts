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
  notes?: string | null;
  [key: string]: unknown;
};

type BuildVaultPublicationCopyOptions = {
  originalPublicationId?: string | null;
  includeNotes?: boolean;
};

/**
 * Build a vault_publications insert payload from an existing publication row or
 * vault_publications row.
 *
 * Bibliographic fields are treated as canonical/static and are copied from the
 * best available source. Vault-local fields stay scoped: notes are intentionally
 * not copied unless a caller opts in, and tags/vault membership are represented
 * elsewhere.
 */
export function buildVaultPublicationCopyPayload(
  vaultPublication: VaultPublicationIdentityFields,
  targetVaultId: string,
  actorUserId: string,
  timestamp = new Date().toISOString(),
  options: BuildVaultPublicationCopyOptions = {},
) {
  const {
    id: _id,
    user_id: _userId,
    vault_id: _vaultId,
    created_at: _createdAt,
    updated_at: _updatedAt,
    created_by: _createdBy,
    updated_by: _updatedBy,
    version: _version,
    notes: sourceNotes,
    ...publicationData
  } = vaultPublication;

  return {
    ...publicationData,
    notes: options.includeNotes ? sourceNotes ?? null : null,
    vault_id: targetVaultId,
    original_publication_id:
      options.originalPublicationId ?? vaultPublication.original_publication_id ?? vaultPublication.id ?? null,
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
