import { useEffect, useState } from 'react';
import { Check, ExternalLink, FolderSync, HardDrive, Link2, Loader2, Shield, Unplug } from 'lucide-react';

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
        showError('failed to load google drive status', (error as Error).message);
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
      showError('failed to start google drive link', (error as Error).message);
      setAction(null);
    }
  };

  const handleEnsureFolder = async () => {
    if (!accessToken) return;

    setAction('ensure');
    try {
      const nextStatus = await ensureGoogleDriveFolder(accessToken);
      setStatus(nextStatus);
      showSuccess('drive folder ready', `${nextStatus.folderName || 'refhub'} is available for pdf storage.`);
    } catch (error) {
      showError('failed to prepare drive folder', (error as Error).message);
    } finally {
      setAction(null);
    }
  };

  const handleDisconnect = async () => {
    if (!accessToken) return;

    setAction('disconnect');
    try {
      setStatus(await disconnectGoogleDrive(accessToken));
      showSuccess('google drive disconnected');
    } catch (error) {
      showError('failed to disconnect google drive', (error as Error).message);
    } finally {
      setAction(null);
    }
  };

  if (!accessToken) {
    return (
      <Alert className="border-fuchsia-500/20 bg-[#171320] text-muted-foreground shadow-[0_0_0_1px_rgba(217,70,239,0.06)]">
        <Shield className="h-4 w-4 text-fuchsia-300" />
        <AlertTitle className="font-mono">session_required</AlertTitle>
        <AlertDescription className="font-mono text-xs sm:text-sm">
          sign in again before managing google drive storage.
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <Card className="border border-fuchsia-500/20 bg-[#110d18] shadow-[0_0_30px_rgba(168,85,247,0.10)]">
        <CardHeader>
          <CardTitle className="font-mono text-xl">google_drive_storage</CardTitle>
          <CardDescription className="font-mono text-xs tracking-[0.2em] text-fuchsia-200/70">
            loading drive link status...
          </CardDescription>
        </CardHeader>
        <CardContent className="font-mono text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-fuchsia-300" />
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
      <Card className="border border-fuchsia-500/20 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.10),transparent_30%),#110d18] shadow-[0_0_36px_rgba(168,85,247,0.12)]">
        <CardHeader>
          <CardTitle className="font-mono text-xl">google_drive_storage</CardTitle>
          <CardDescription className="font-mono text-sm text-muted-foreground">
            refhub keeps google credentials on the backend and writes pdfs into a managed drive folder named
            <span className="text-fuchsia-200"> refhub</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={currentStatus.linked ? 'default' : 'secondary'} className="font-mono">
              {currentStatus.linked ? 'linked' : 'not_linked'}
            </Badge>
            <Badge variant={getFolderStatusTone(currentStatus.folderStatus)} className="font-mono">
              {currentStatus.folderStatus}
            </Badge>
          </div>

          <Alert className="border-fuchsia-500/20 bg-[#171320] text-muted-foreground">
            <Shield className="h-4 w-4 text-cyan-300" />
            <AlertTitle className="font-mono">least_privilege_scope</AlertTitle>
            <AlertDescription className="font-mono text-xs sm:text-sm">
              refhub requests <span className="text-fuchsia-200">drive.file</span> only. it can manage files it creates
              inside the linked folder, without exposing google tokens to the frontend or extension.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-fuchsia-500/15 bg-[#16111f] p-4">
              <div className="mb-2 flex items-center gap-2 font-mono text-sm text-fuchsia-100">
                <HardDrive className="h-4 w-4 text-fuchsia-300" />
                link_status
              </div>
              <p className="font-mono text-sm text-muted-foreground">
                {currentStatus.linked
                  ? `linked_at ${formatTimestamp(currentStatus.lastLinkedAt)}`
                  : 'connect google drive to enable backend-mediated pdf storage.'}
              </p>
            </div>
            <div className="rounded-xl border border-cyan-500/15 bg-[#141320] p-4">
              <div className="mb-2 flex items-center gap-2 font-mono text-sm text-cyan-100">
                <Link2 className="h-4 w-4 text-cyan-300" />
                target_folder
              </div>
              <p className="font-mono text-sm text-muted-foreground">
                {currentStatus.folderName
                  ? `${currentStatus.folderName} (${currentStatus.folderId})`
                  : currentStatus.linked
                    ? 'folder is pending bootstrap or needs to be recreated.'
                    : 'no drive folder is linked yet.'}
              </p>
            </div>
          </div>

          {currentStatus.lastError ? (
            <Alert className="border-destructive/40 bg-destructive/5 text-muted-foreground">
              <FolderSync className="h-4 w-4 text-destructive" />
              <AlertTitle className="font-mono">folder_sync_issue</AlertTitle>
              <AlertDescription className="font-mono text-xs sm:text-sm">
                {currentStatus.lastError}
              </AlertDescription>
            </Alert>
          ) : null}

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              className="bg-gradient-primary font-mono text-white shadow-lg shadow-fuchsia-950/40 hover:opacity-90 hover:shadow-fuchsia-900/50"
              onClick={() => void handleConnect()}
              disabled={action !== null}
            >
              {action === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              {currentStatus.linked ? 'reconnect google drive' : 'connect google drive'}
            </Button>
            {currentStatus.folderStatus === 'ready' ? (
              <div className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 font-mono text-sm text-emerald-200">
                <Check className="h-4 w-4" />
                folder prepared
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="border-fuchsia-500/30 bg-fuchsia-500/10 font-mono text-fuchsia-100 hover:bg-fuchsia-500/20 hover:text-fuchsia-50"
                onClick={() => void handleEnsureFolder()}
                disabled={!currentStatus.linked || action !== null}
              >
                {action === 'ensure' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSync className="h-4 w-4" />}
                prepare refhub folder
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="font-mono text-cyan-100 hover:bg-cyan-500/10 hover:text-cyan-50"
              onClick={() => void handleDisconnect()}
              disabled={!currentStatus.linked || action !== null}
            >
              {action === 'disconnect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
              unlink drive
            </Button>
          </div>

          <div className="font-mono text-xs text-muted-foreground">
            scope: {currentStatus.scope}
            <br />
            last folder check: {formatTimestamp(currentStatus.lastCheckedAt)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
