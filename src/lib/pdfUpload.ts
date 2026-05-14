import { getBackendApiBaseUrl } from '@/lib/apiKeys';
import { supabase } from '@/integrations/supabase/client';

export interface DrivePdfUploadResult {
  fileId?: string;
  pdfUrl: string | null;
  sourceUrl?: string | null;
  provider: string;
  stored: boolean;
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

async function uploadDrivePdf(path: string, file: File): Promise<DrivePdfUploadResult> {
  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Please choose a PDF file.');
  }

  const accessToken = await getAccessToken();
  const response = await fetch(`${getBackendApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/pdf',
    },
    body: file,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, response.status));
  }

  const data = (payload as { data?: DrivePdfUploadResult } | null)?.data;
  if (!data) {
    throw new Error('PDF upload response did not include Drive metadata.');
  }

  return data;
}

export function uploadPublicationDrivePdf(publicationId: string, file: File) {
  return uploadDrivePdf(`/publications/${encodeURIComponent(publicationId)}/pdf`, file);
}

export function uploadVaultPublicationDrivePdf(vaultId: string, vaultPublicationId: string, file: File) {
  return uploadDrivePdf(`/google-drive/vaults/${encodeURIComponent(vaultId)}/items/${encodeURIComponent(vaultPublicationId)}/pdf`, file);
}
