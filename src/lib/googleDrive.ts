import { getBackendApiBaseUrl } from '@/lib/apiKeys';

export interface GoogleDriveStatus {
  linked: boolean;
  scope: string;
  folderStatus: 'unlinked' | 'pending_creation' | 'ready' | 'error';
  folderId: string | null;
  folderName: string | null;
  googleDriveEmail: string | null;
  lastLinkedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

class GoogleDriveRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GoogleDriveRequestError';
    this.status = status;
  }
}

function getErrorMessage(payload: unknown, status: number) {
  return (
    (payload as { error?: { message?: string } } | null)?.error?.message ||
    (payload as { message?: string } | null)?.message ||
    `Google Drive request failed (${status})`
  );
}

async function googleDriveRequest<TResponse>(accessToken: string, path = '', init?: RequestInit): Promise<TResponse> {
  const response = await fetch(`${getBackendApiBaseUrl()}/google-drive${path}`, {
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
    throw new GoogleDriveRequestError(response.status, getErrorMessage(payload, response.status));
  }

  return payload as TResponse;
}

function mapStatus(payload: unknown): GoogleDriveStatus {
  const data = (payload as { data?: Record<string, unknown> } | null)?.data ?? {};
  return {
    linked: Boolean(data.linked),
    scope: String(data.scope || 'https://www.googleapis.com/auth/drive.file'),
    folderStatus: (data.folderStatus || 'unlinked') as GoogleDriveStatus['folderStatus'],
    folderId: typeof data.folderId === 'string' ? data.folderId : null,
    folderName: typeof data.folderName === 'string' ? data.folderName : null,
    googleDriveEmail: typeof data.googleDriveEmail === 'string' ? data.googleDriveEmail : null,
    lastLinkedAt: typeof data.lastLinkedAt === 'string' ? data.lastLinkedAt : null,
    lastCheckedAt: typeof data.lastCheckedAt === 'string' ? data.lastCheckedAt : null,
    lastError: typeof data.lastError === 'string' ? data.lastError : null,
  };
}

export async function fetchGoogleDriveStatus(accessToken: string) {
  const payload = await googleDriveRequest<unknown>(accessToken);
  return mapStatus(payload);
}

export async function startGoogleDriveLink(accessToken: string, returnTo: string) {
  const payload = await googleDriveRequest<{ data?: { authorization_url?: string } }>(accessToken, '/connect', {
    method: 'POST',
    body: JSON.stringify({
      return_to: returnTo,
    }),
  });

  const authorizationUrl = payload.data?.authorization_url;
  if (!authorizationUrl) {
    throw new Error('Google Drive authorization URL was not returned by the backend.');
  }

  return authorizationUrl;
}

export async function ensureGoogleDriveFolder(accessToken: string) {
  const payload = await googleDriveRequest<unknown>(accessToken, '/folder', {
    method: 'POST',
  });
  return mapStatus(payload);
}

export async function disconnectGoogleDrive(accessToken: string) {
  const payload = await googleDriveRequest<unknown>(accessToken, '', {
    method: 'DELETE',
  });
  return mapStatus(payload);
}
