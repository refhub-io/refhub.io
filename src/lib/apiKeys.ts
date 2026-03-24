export const API_KEY_SCOPES = [
  { value: 'vaults:read', label: 'vaults:read', description: 'Read vault metadata and contents.' },
  { value: 'vaults:write', label: 'vaults:write', description: 'Create and update vault items.' },
  { value: 'vaults:export', label: 'vaults:export', description: 'Export vault contents in supported formats.' },
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]['value'];

export interface ApiKeyRecord {
  id: string;
  label: string;
  description: string | null;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  vaultIds: string[];
}

export interface ApiKeyCreateInput {
  label: string;
  description?: string;
  scopes: ApiKeyScope[];
  expiresAt?: string | null;
  vaultIds?: string[];
}

export interface ApiKeyCreateResult {
  key: ApiKeyRecord;
  secret: string;
}

interface ApiKeyResponseRecord {
  id: string;
  label: string;
  description?: string | null;
  key_prefix?: string;
  keyPrefix?: string;
  scopes: ApiKeyScope[];
  expires_at?: string | null;
  expiresAt?: string | null;
  revoked_at?: string | null;
  revokedAt?: string | null;
  last_used_at?: string | null;
  lastUsedAt?: string | null;
  created_at?: string;
  createdAt?: string;
  vault_ids?: string[];
  vaultIds?: string[];
}

const configuredApiKeyManagementBaseUrl = import.meta.env.VITE_API_KEY_MANAGEMENT_BASE_URL?.trim() || '';
const defaultApiKeyManagementBaseUrl = '/api/v1/keys';

export class ApiKeyManagementUnavailableError extends Error {
  constructor(message = 'API key management endpoint is not available.') {
    super(message);
    this.name = 'ApiKeyManagementUnavailableError';
  }
}

class ApiKeyManagementRequestError extends Error {
  status: number;

  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = 'ApiKeyManagementRequestError';
    this.status = status;
    this.payload = payload;
  }
}

function mapApiKey(record: ApiKeyResponseRecord): ApiKeyRecord {
  return {
    id: record.id,
    label: record.label,
    description: record.description ?? null,
    keyPrefix: record.key_prefix ?? record.keyPrefix ?? '',
    scopes: record.scopes,
    expiresAt: record.expires_at ?? record.expiresAt ?? null,
    revokedAt: record.revoked_at ?? record.revokedAt ?? null,
    lastUsedAt: record.last_used_at ?? record.lastUsedAt ?? null,
    createdAt: record.created_at ?? record.createdAt ?? new Date(0).toISOString(),
    vaultIds: record.vault_ids ?? record.vaultIds ?? [],
  };
}

export function getApiKeyManagementBaseUrl() {
  const baseUrl = configuredApiKeyManagementBaseUrl || defaultApiKeyManagementBaseUrl;
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export function isApiKeyManagementUsingDefaultBaseUrl() {
  return !configuredApiKeyManagementBaseUrl;
}

function getManagementUrl(path = '') {
  return `${getApiKeyManagementBaseUrl()}${path}`;
}

function getErrorMessage(payload: unknown, status: number) {
  return (
    (payload as { error?: { message?: string; details?: string }; message?: string } | null)?.error?.message ||
    (payload as { error?: { details?: string } } | null)?.error?.details ||
    (payload as { error?: string; message?: string } | null)?.error ||
    (payload as { message?: string; details?: string } | null)?.message ||
    (payload as { details?: string } | null)?.details ||
    `API key request failed (${status})`
  );
}

function extractApiKeyRecords(payload: unknown): ApiKeyResponseRecord[] {
  const candidate =
    (payload as { data?: unknown; api_keys?: unknown; keys?: unknown; records?: unknown } | null)?.data ??
    (payload as { api_keys?: unknown } | null)?.api_keys ??
    (payload as { keys?: unknown } | null)?.keys ??
    (payload as { records?: unknown } | null)?.records ??
    payload;

  return Array.isArray(candidate) ? (candidate as ApiKeyResponseRecord[]) : [];
}

function extractApiKeyRecord(payload: unknown): ApiKeyResponseRecord {
  const candidate =
    (payload as { data?: unknown; key?: unknown; api_key?: unknown; record?: unknown } | null)?.data ??
    (payload as { key?: unknown } | null)?.key ??
    (payload as { api_key?: unknown } | null)?.api_key ??
    (payload as { record?: unknown } | null)?.record ??
    payload;

  return candidate as ApiKeyResponseRecord;
}

function extractApiKeySecret(payload: unknown) {
  const secret =
    (payload as { secret?: unknown; token?: unknown; plaintext_key?: unknown } | null)?.secret ??
    (payload as { token?: unknown } | null)?.token ??
    (payload as { plaintext_key?: unknown } | null)?.plaintext_key;

  return typeof secret === 'string' ? secret : null;
}

async function apiKeyRequest<TResponse>(
  accessToken: string,
  path = '',
  init?: RequestInit,
  options?: { treatMissingRouteAsUnavailable?: boolean },
): Promise<TResponse> {
  const response = await fetch(getManagementUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (options?.treatMissingRouteAsUnavailable !== false && [404, 405, 501].includes(response.status)) {
      throw new ApiKeyManagementUnavailableError(
        `API key management endpoint is not available at ${getManagementUrl(path)}.`,
      );
    }

    throw new ApiKeyManagementRequestError(response.status, getErrorMessage(payload, response.status), payload);
  }

  return payload as TResponse;
}

export function isApiKeyManagementConfigured() {
  return true;
}

export async function listApiKeys(accessToken: string) {
  const payload = await apiKeyRequest<unknown>(accessToken);
  return extractApiKeyRecords(payload).map(mapApiKey);
}

export async function createApiKey(accessToken: string, input: ApiKeyCreateInput): Promise<ApiKeyCreateResult> {
  const payload = await apiKeyRequest<unknown>(accessToken, '', {
    method: 'POST',
    body: JSON.stringify({
      label: input.label,
      description: input.description?.trim() || null,
      scopes: input.scopes,
      expires_at: input.expiresAt ?? null,
      vault_ids: input.vaultIds ?? [],
    }),
  });

  const secret = extractApiKeySecret(payload);
  if (!secret) {
    throw new Error('API key secret was not returned by the backend.');
  }

  return {
    key: mapApiKey(extractApiKeyRecord(payload)),
    secret,
  };
}

export async function revokeApiKey(accessToken: string, apiKeyId: string) {
  try {
    const payload = await apiKeyRequest<unknown>(
      accessToken,
      `/${apiKeyId}/revoke`,
      { method: 'POST' },
      { treatMissingRouteAsUnavailable: false },
    );

    return mapApiKey(extractApiKeyRecord(payload));
  } catch (error) {
    if (!(error instanceof ApiKeyManagementRequestError) || ![404, 405].includes(error.status)) {
      throw error;
    }
  }

  const payload = await apiKeyRequest<unknown>(
    accessToken,
    `/${apiKeyId}`,
    { method: 'DELETE' },
    { treatMissingRouteAsUnavailable: false },
  );

  return mapApiKey(extractApiKeyRecord(payload));
}
