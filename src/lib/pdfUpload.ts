import { getBackendApiBaseUrl } from '@/lib/apiKeys';
import { supabase } from '@/integrations/supabase/client';

// Keep raw uploads comfortably below Netlify's 6 MiB synchronous Function body ceiling.
export const API_SAFE_RAW_PDF_UPLOAD_BYTES = 5.5 * 1024 * 1024;

export interface DrivePdfUploadResult {
  fileId?: string;
  pdfUrl: string | null;
  sourceUrl?: string | null;
  provider: string;
  stored: boolean;
}

interface DriveResumableSession {
  upload_url?: string;
  uploadUrl?: string;
  file_name?: string;
  fileName?: string;
}

interface GoogleDriveUploadResponse {
  id?: string;
  webViewLink?: string;
  webContentLink?: string;
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error('No authenticated session available for PDF upload.');
  }

  return accessToken;
}

function getErrorMessage(payload: unknown, status: number) {
  return (
    (payload as { error?: { message?: string; details?: string } } | null)?.error?.message ||
    (payload as { error?: { details?: string } } | null)?.error?.details ||
    (payload as { message?: string; details?: string } | null)?.message ||
    (payload as { details?: string } | null)?.details ||
    `PDF upload failed (${status})`
  );
}

async function parseJsonResponse(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function assertPdfFile(file: File) {
  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Please choose a PDF file.');
  }
}

async function uploadDrivePdf(path: string, file: File): Promise<DrivePdfUploadResult> {
  assertPdfFile(file);

  const accessToken = await getAccessToken();
  const response = await fetch(`${getBackendApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/pdf',
    },
    body: file,
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, response.status));
  }

  const data = (payload as { data?: DrivePdfUploadResult } | null)?.data;
  if (!data) {
    throw new Error('PDF upload response did not include Drive metadata.');
  }

  return data;
}

async function createDrivePdfSession(basePath: string, accessToken: string): Promise<DriveResumableSession> {
  const response = await fetch(`${getBackendApiBaseUrl()}${basePath}/session`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Could not create Drive upload session: ${getErrorMessage(payload, response.status)}`);
  }

  const data = (payload as { data?: DriveResumableSession } | null)?.data;
  if (!data?.upload_url && !data?.uploadUrl) {
    throw new Error('Drive upload session response did not include an upload URL.');
  }

  return data;
}

async function uploadPdfToDrive(uploadUrl: string, file: File): Promise<GoogleDriveUploadResponse> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/pdf',
    },
    body: file,
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Direct Google Drive upload failed (${response.status}).`);
  }

  const driveFile = payload as GoogleDriveUploadResponse | null;
  if (!driveFile?.id) {
    throw new Error('Google Drive upload response did not include a file ID.');
  }

  return driveFile;
}

async function completeDrivePdfUpload(
  basePath: string,
  accessToken: string,
  driveFile: GoogleDriveUploadResponse,
): Promise<DrivePdfUploadResult> {
  const response = await fetch(`${getBackendApiBaseUrl()}${basePath}/complete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_id: driveFile.id,
      web_view_link: driveFile.webViewLink || driveFile.webContentLink || null,
    }),
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Could not record Drive upload: ${getErrorMessage(payload, response.status)}`);
  }

  const data = (payload as { data?: DrivePdfUploadResult } | null)?.data;
  if (!data) {
    throw new Error('Drive upload completion response did not include Drive metadata.');
  }

  return data;
}

async function uploadVaultDrivePdfResumable(basePath: string, file: File): Promise<DrivePdfUploadResult> {
  assertPdfFile(file);

  const accessToken = await getAccessToken();
  const session = await createDrivePdfSession(basePath, accessToken);
  const driveFile = await uploadPdfToDrive(session.upload_url || session.uploadUrl || '', file);

  return completeDrivePdfUpload(basePath, accessToken, driveFile);
}

export function uploadPublicationDrivePdf(publicationId: string, file: File) {
  return uploadDrivePdf(`/publications/${encodeURIComponent(publicationId)}/pdf`, file);
}

export function uploadVaultPublicationDrivePdf(vaultId: string, vaultPublicationId: string, file: File) {
  const rawUploadPath = `/google-drive/vaults/${encodeURIComponent(vaultId)}/items/${encodeURIComponent(vaultPublicationId)}/pdf`;

  if (file.size <= API_SAFE_RAW_PDF_UPLOAD_BYTES) {
    return uploadDrivePdf(rawUploadPath, file);
  }

  const resumableUploadPath = `/vaults/${encodeURIComponent(vaultId)}/items/${encodeURIComponent(vaultPublicationId)}/pdf`;
  return uploadVaultDrivePdfResumable(resumableUploadPath, file);
}
