import { useEffect, useState } from 'react';
import { ExternalLink, FolderSync, HardDrive, Link2, Loader2, Shield, Unplug } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { showError, showSuccess } from '@/lib/toast';
import {
  disconnectGoogleDrive,
  ensureGoogleDriveFolder,
  fetchGoogleDriveStatus,
  GoogleDriveStatus,
  startGoogleDriveLink,
} from '@/lib/googleDrive';

interface GoogleDriveSettingsPanelProps {
  accessToken: string | undefined;
}

function formatTimestamp(value: string | null) {
  if (!value) return 'not_recorded';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getFolderStatusTone(status: GoogleDriveStatus['folderStatus']) {
  if (status === 'ready') return 'default';
  if (status === 'error') return 'destructive';
  return 'secondary';
}

export function GoogleDriveSettingsPanel({ accessToken }: GoogleDriveSettingsPanelProps) {
  const [status, setStatus] = useState<GoogleDriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'connect' | 'ensure' | 'disconnect' | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        setStatus(await fetchGoogleDriveStatus(accessToken));
      } catch (error) {
        showError('Failed to load Google Drive status', (error as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [accessToken]);

  const handleConnect = async () => {
    if (!accessToken) return;

    setAction('connect');
    try {
      const returnTo = `${window.location.origin}/profile-edit?tab=storage`;
      const authorizationUrl = await startGoogleDriveLink(accessToken, returnTo);
      window.location.assign(authorizationUrl);
    } catch (error) {
      showError('Failed to start Google Drive link', (error as Error).message);
      setAction(null);
    }
  };

  const handleEnsureFolder = async () => {
    if (!accessToken) return;

    setAction('ensure');
    try {
      const nextStatus = await ensureGoogleDriveFolder(accessToken);
      setStatus(nextStatus);
      showSuccess('Drive folder ready', `${nextStatus.folderName || 'refhub'} is available for PDF storage.`);
    } catch (error) {
      showError('Failed to prepare Drive folder', (error as Error).message);
    } finally {
      setAction(null);
    }
  };

  const handleDisconnect = async () => {
    if (!accessToken) return;

    setAction('disconnect');
    try {
      setStatus(await disconnectGoogleDrive(accessToken));
      showSuccess('Google Drive disconnected');
    } catch (error) {
      showError('Failed to disconnect Google Drive', (error as Error).message);
    } finally {
      setAction(null);
    }
  };

  if (!accessToken) {
    return (
      <Alert className="border-border bg-muted/40">
        <Shield className="h-4 w-4" />
        <AlertTitle className="font-mono">session_required</AlertTitle>
        <AlertDescription className="font-mono text-xs sm:text-sm">
          Sign in again before managing Google Drive storage.
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <Card className="border-2 border-border">
        <CardHeader>
          <CardTitle className="font-mono text-xl">google_drive_storage</CardTitle>
          <CardDescription className="font-mono">Loading Drive link status…</CardDescription>
        </CardHeader>
        <CardContent className="font-mono text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const currentStatus = status ?? {
    linked: false,
    scope: 'https://www.googleapis.com/auth/drive.file',
    folderStatus: 'unlinked' as const,
    folderId: null,
    folderName: null,
    googleDriveEmail: null,
    lastLinkedAt: null,
    lastCheckedAt: null,
    lastError: null,
  };

  return (
    <div className="space-y-6">
      <Card className="border-2 border-border">
        <CardHeader>
          <CardTitle className="font-mono text-xl">google_drive_storage</CardTitle>
          <CardDescription className="font-mono">
            RefHub keeps Google credentials on the backend and writes PDFs into a managed Drive folder named
            <span className="text-foreground"> refhub</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={currentStatus.linked ? 'default' : 'secondary'} className="font-mono">
              {currentStatus.linked ? 'linked' : 'not_linked'}
            </Badge>
            <Badge variant={getFolderStatusTone(currentStatus.folderStatus)} className="font-mono capitalize">
              {currentStatus.folderStatus}
            </Badge>
          </div>

          <Alert className="border-border bg-muted/40">
            <Shield className="h-4 w-4" />
            <AlertTitle className="font-mono">least_privilege_scope</AlertTitle>
            <AlertDescription className="font-mono text-xs sm:text-sm">
              RefHub requests <span className="text-foreground">drive.file</span> only. It can manage files it creates
              inside the linked folder, without exposing Google tokens to the frontend or extension.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <div className="mb-2 flex items-center gap-2 font-mono text-sm text-foreground">
                <HardDrive className="h-4 w-4" />
                link_status
              </div>
              <p className="font-mono text-sm text-muted-foreground">
                {currentStatus.linked
                  ? `linked_at ${formatTimestamp(currentStatus.lastLinkedAt)}`
                  : 'Connect Google Drive to enable backend-mediated PDF storage.'}
              </p>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="mb-2 flex items-center gap-2 font-mono text-sm text-foreground">
                <Link2 className="h-4 w-4" />
                target_folder
              </div>
              <p className="font-mono text-sm text-muted-foreground">
                {currentStatus.folderName
                  ? `${currentStatus.folderName} (${currentStatus.folderId})`
                  : currentStatus.linked
                    ? 'Folder is pending bootstrap or needs to be recreated.'
                    : 'No Drive folder is linked yet.'}
              </p>
            </div>
          </div>

          {currentStatus.lastError ? (
            <Alert className="border-destructive/40 bg-destructive/5">
              <FolderSync className="h-4 w-4" />
              <AlertTitle className="font-mono">folder_sync_issue</AlertTitle>
              <AlertDescription className="font-mono text-xs sm:text-sm">
                {currentStatus.lastError}
              </AlertDescription>
            </Alert>
          ) : null}

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" className="font-mono" onClick={() => void handleConnect()} disabled={action !== null}>
              {action === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              {currentStatus.linked ? 'reconnect_google_drive' : 'connect_google_drive'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="font-mono"
              onClick={() => void handleEnsureFolder()}
              disabled={!currentStatus.linked || action !== null}
            >
              {action === 'ensure' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSync className="h-4 w-4" />}
              prepare_refhub_folder
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="font-mono"
              onClick={() => void handleDisconnect()}
              disabled={!currentStatus.linked || action !== null}
            >
              {action === 'disconnect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
              disconnect
            </Button>
          </div>

          <div className="font-mono text-xs text-muted-foreground">
            Scope: {currentStatus.scope}
            <br />
            Last folder check: {formatTimestamp(currentStatus.lastCheckedAt)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
