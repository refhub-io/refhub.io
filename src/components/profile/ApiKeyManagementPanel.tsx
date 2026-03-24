import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { AlertCircle, CheckCircle2, Copy, KeyRound, Loader2, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess, showWarning } from '@/lib/toast';
import {
  API_KEY_SCOPES,
  ApiKeyManagementUnavailableError,
  ApiKeyRecord,
  ApiKeyScope,
  createApiKey,
  getApiKeyManagementBaseUrl,
  isApiKeyManagementUsingDefaultBaseUrl,
  listApiKeys,
  revokeApiKey,
} from '@/lib/apiKeys';

interface ApiKeyManagementPanelProps {
  userId: string | undefined;
  userEmail: string | undefined;
  accessToken: string | undefined;
}

interface AccessibleVault {
  id: string;
  name: string;
  updatedAt: string;
  permission: 'owner' | 'editor' | 'viewer';
}

const EXPIRATION_OPTIONS = [
  { value: 'never', label: 'never_expires' },
  { value: '7', label: '7_days' },
  { value: '30', label: '30_days' },
  { value: '90', label: '90_days' },
] as const;

function formatTimestamp(value: string | null) {
  if (!value) return 'never';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatRelativeTimestamp(value: string | null) {
  if (!value) return 'never';

  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

function getScopeLabel(scope: ApiKeyScope) {
  return API_KEY_SCOPES.find((item) => item.value === scope)?.label ?? scope;
}

export function ApiKeyManagementPanel({ userId, userEmail, accessToken }: ApiKeyManagementPanelProps) {
  const managementBaseUrl = getApiKeyManagementBaseUrl();
  const usingDefaultManagementBaseUrl = isApiKeyManagementUsingDefaultBaseUrl();
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [keyLoadError, setKeyLoadError] = useState<string | null>(null);
  const [vaults, setVaults] = useState<AccessibleVault[]>([]);
  const [loadingVaults, setLoadingVaults] = useState(true);
  const [vaultLoadError, setVaultLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRecord | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<{ label: string; secret: string } | null>(null);

  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [expirationDays, setExpirationDays] = useState<(typeof EXPIRATION_OPTIONS)[number]['value']>('90');
  const [restrictToVaults, setRestrictToVaults] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<Record<ApiKeyScope, boolean>>({
    'vaults:read': true,
    'vaults:write': false,
    'vaults:export': false,
  });
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>([]);

  const selectedScopeValues = useMemo(
    () => API_KEY_SCOPES.filter((scope) => selectedScopes[scope.value]).map((scope) => scope.value),
    [selectedScopes],
  );

  const fetchApiKeys = useCallback(async () => {
    if (!userId) {
      setApiKeys([]);
      setLoadingKeys(false);
      return;
    }

    if (!accessToken) {
      setApiKeys([]);
      setKeyLoadError('No authenticated session available for API key management.');
      setLoadingKeys(false);
      return;
    }

    setLoadingKeys(true);
    setKeyLoadError(null);

    try {
      const keys = await listApiKeys(accessToken);
      setApiKeys(keys);
    } catch (error) {
      if (error instanceof ApiKeyManagementUnavailableError) {
        setKeyLoadError(error.message);
      } else {
        setKeyLoadError((error as Error).message);
      }
    } finally {
      setLoadingKeys(false);
    }
  }, [accessToken, userId]);

  const fetchAccessibleVaults = useCallback(async () => {
    if (!userId) {
      setVaults([]);
      setLoadingVaults(false);
      return;
    }

    setLoadingVaults(true);
    setVaultLoadError(null);

    try {
      const shareFilters = [`shared_with_user_id.eq.${userId}`];
      if (userEmail) {
        shareFilters.unshift(`shared_with_email.eq.${userEmail}`);
      }

      const [{ data: ownedVaults, error: ownedError }, { data: shares, error: shareError }] = await Promise.all([
        supabase.from('vaults').select('id, name, updated_at').eq('user_id', userId).order('name'),
        supabase
          .from('vault_shares')
          .select('vault_id, role')
          .or(shareFilters.join(',')),
      ]);

      if (ownedError) throw ownedError;
      if (shareError) throw shareError;

      const vaultMap = new Map<string, AccessibleVault>();

      for (const vault of ownedVaults ?? []) {
        vaultMap.set(vault.id, {
          id: vault.id,
          name: vault.name,
          updatedAt: vault.updated_at,
          permission: 'owner',
        });
      }

      const sharedVaultIds = Array.from(
        new Set((shares ?? []).map((share) => share.vault_id).filter((vaultId): vaultId is string => Boolean(vaultId))),
      );

      if (sharedVaultIds.length > 0) {
        const { data: sharedVaults, error: sharedVaultsError } = await supabase
          .from('vaults')
          .select('id, name, updated_at')
          .in('id', sharedVaultIds);

        if (sharedVaultsError) throw sharedVaultsError;

        for (const vault of sharedVaults ?? []) {
          const role = shares?.find((share) => share.vault_id === vault.id)?.role;
          const permission: AccessibleVault['permission'] =
            role === 'owner' || role === 'editor' || role === 'viewer' ? role : 'viewer';

          if (!vaultMap.has(vault.id)) {
            vaultMap.set(vault.id, {
              id: vault.id,
              name: vault.name,
              updatedAt: vault.updated_at,
              permission,
            });
          }
        }
      }

      setVaults(Array.from(vaultMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      setVaultLoadError((error as Error).message);
    } finally {
      setLoadingVaults(false);
    }
  }, [userEmail, userId]);

  useEffect(() => {
    void fetchApiKeys();
  }, [fetchApiKeys]);

  useEffect(() => {
    void fetchAccessibleVaults();
  }, [fetchAccessibleVaults]);

  const handleScopeToggle = (scope: ApiKeyScope, checked: boolean) => {
    setSelectedScopes((current) => ({ ...current, [scope]: checked }));
  };

  const handleVaultToggle = (vaultId: string, checked: boolean) => {
    setSelectedVaultIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, vaultId]));
      }

      return current.filter((id) => id !== vaultId);
    });
  };

  const handleCopySecret = async () => {
    if (!createdSecret) return;

    try {
      await navigator.clipboard.writeText(createdSecret.secret);
      showSuccess('API key copied', 'Store it somewhere secure now. It will not be shown again.');
    } catch (error) {
      showError('Failed to copy API key', (error as Error).message);
    }
  };

  const handleCreateApiKey = async () => {
    if (!accessToken) {
      showError('Missing session', 'Sign in again before creating an API key.');
      return;
    }

    if (!label.trim()) {
      showWarning('Label required', 'Give the API key a clear label so you can identify it later.');
      return;
    }

    if (selectedScopeValues.length === 0) {
      showWarning('Select at least one scope');
      return;
    }

    if (restrictToVaults && selectedVaultIds.length === 0) {
      showWarning('Select at least one vault', 'Restricted keys need at least one permitted vault.');
      return;
    }

    setIsCreating(true);

    try {
      const expiresAt =
        expirationDays === 'never'
          ? null
          : new Date(Date.now() + Number(expirationDays) * 24 * 60 * 60 * 1000).toISOString();

      const result = await createApiKey(accessToken, {
        label: label.trim(),
        description: description.trim(),
        scopes: selectedScopeValues,
        expiresAt,
        vaultIds: restrictToVaults ? selectedVaultIds : [],
      });

      setCreatedSecret({ label: result.key.label, secret: result.secret });
      setLabel('');
      setDescription('');
      setExpirationDays('90');
      setRestrictToVaults(false);
      setSelectedVaultIds([]);
      setSelectedScopes({
        'vaults:read': true,
        'vaults:write': false,
        'vaults:export': false,
      });

      await fetchApiKeys();
      showSuccess('API key created', 'Copy the secret now. Only the prefix will remain visible later.');
    } catch (error) {
      if (error instanceof ApiKeyManagementUnavailableError) {
        setKeyLoadError(error.message);
      }
      showError('Failed to create API key', (error as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget || !accessToken) return;

    setIsRevoking(true);

    try {
      const updated = await revokeApiKey(accessToken, revokeTarget.id);
      setApiKeys((current) => current.map((key) => (key.id === updated.id ? updated : key)));
      showSuccess('API key revoked', `${revokeTarget.label} can no longer be used.`);
      setRevokeTarget(null);
    } catch (error) {
      showError('Failed to revoke API key', (error as Error).message);
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* {usingDefaultManagementBaseUrl && (
        <Alert className="border-border bg-muted/40">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <AlertTitle className="font-mono">api_key_backend_route</AlertTitle>
          <AlertDescription className="font-mono text-xs sm:text-sm">
            Using the default API key management route at <span className="text-foreground">{managementBaseUrl}</span>.
            Set <span className="text-foreground">VITE_API_KEY_MANAGEMENT_BASE_URL</span> to the backend base URL only if
            the API is hosted elsewhere.
          </AlertDescription>
        </Alert>
      )} */}

      {createdSecret && (
        <Alert className="border-primary/40 bg-primary/5">
          <KeyRound className="h-4 w-4 text-primary" />
          <AlertTitle className="font-mono">new_key_visible_once</AlertTitle>
          <AlertDescription className="space-y-3 font-mono">
            <p>
              Save the full secret for <span className="text-foreground">{createdSecret.label}</span> now. After you
              dismiss this, RefHub will only show the non-sensitive prefix.
            </p>
            <div className="rounded-lg border border-border bg-background/80 p-3">
              <p className="break-all text-xs text-foreground sm:text-sm">{createdSecret.secret}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="font-mono" onClick={() => void handleCopySecret()}>
                <Copy className="h-4 w-4" />
                copy_secret
              </Button>
              <Button type="button" variant="ghost" className="font-mono" onClick={() => setCreatedSecret(null)}>
                dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-2 border-border">
          <CardHeader>
            <CardTitle className="font-mono text-xl">create_api_key</CardTitle>
            <CardDescription className="font-mono">
              Generate a scoped key for scripts or integrations. Start narrow and add access only where needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="apiKeyLabel" className="font-mono">
                label
              </Label>
              <Input
                id="apiKeyLabel"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="research_sync_bot"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKeyDescription" className="font-mono">
                description
              </Label>
              <Textarea
                id="apiKeyDescription"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Used by local scripts that sync a private vault."
                className="min-h-24 font-mono"
              />
            </div>

            <div className="space-y-3">
              <Label className="font-mono">scopes</Label>
              <div className="space-y-3 rounded-xl border border-border p-4">
                {API_KEY_SCOPES.map((scope) => (
                  <label key={scope.value} className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedScopes[scope.value]}
                      onCheckedChange={(checked) => handleScopeToggle(scope.value, checked === true)}
                    />
                    <div className="space-y-1">
                      <p className="font-mono text-sm text-foreground">{scope.label}</p>
                      <p className="text-sm text-muted-foreground">{scope.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="font-mono">expiration</Label>
                <Select value={expirationDays} onValueChange={(value) => setExpirationDays(value as typeof expirationDays)}>
                  <SelectTrigger className="font-mono">
                    <SelectValue placeholder="Select expiration" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRATION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="font-mono">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="font-mono">vault_access</Label>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm font-mono transition-colors hover:border-primary/50"
                  onClick={() => setRestrictToVaults((current) => !current)}
                >
                  <span className="min-w-0 flex-1 break-words">{restrictToVaults ? 'selected_vaults_only' : 'all_accessible_vaults'}</span>
                  <Badge variant={restrictToVaults ? 'secondary' : 'outline'} className="shrink-0">
                    {restrictToVaults ? `${selectedVaultIds.length}_selected` : 'unrestricted'}
                  </Badge>
                </button>
              </div>
            </div>

            {restrictToVaults && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm text-foreground">allowed_vaults</p>
                    <p className="text-sm text-muted-foreground">Only these vaults will be reachable with the new key.</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="font-mono" onClick={() => setSelectedVaultIds([])}>
                    clear
                  </Button>
                </div>

                {loadingVaults && (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                )}

                {!loadingVaults && vaultLoadError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="font-mono">vault_load_failed</AlertTitle>
                    <AlertDescription className="font-mono text-xs sm:text-sm">{vaultLoadError}</AlertDescription>
                  </Alert>
                )}

                {!loadingVaults && !vaultLoadError && vaults.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No accessible vaults found for restriction.
                  </p>
                )}

                {!loadingVaults && !vaultLoadError && vaults.length > 0 && (
                  <div className="space-y-2">
                    {vaults.map((vault) => (
                      <label
                        key={vault.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-3"
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedVaultIds.includes(vault.id)}
                            onCheckedChange={(checked) => handleVaultToggle(vault.id, checked === true)}
                          />
                          <div>
                            <p className="font-medium text-foreground">{vault.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {vault.permission} access, updated {formatRelativeTimestamp(vault.updatedAt)}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline">{vault.permission}</Badge>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle className="font-mono">safe_defaults</AlertTitle>
              <AlertDescription className="font-mono text-xs sm:text-sm">
                Newly generated secrets are shown once. Store them immediately. RefHub only retains the prefix and a
                server-side hash after creation.
              </AlertDescription>
            </Alert>

            <Button
              type="button"
              variant="glow"
              className="w-full font-mono"
              onClick={handleCreateApiKey}
              disabled={isCreating || loadingVaults || !accessToken}
            >
              {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
              create_api_key
            </Button>
          </CardContent>
        </Card>

        <Card className="border-2 border-border">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="font-mono text-xl">active_keys</CardTitle>
                <CardDescription className="font-mono">
                  Review prefixes, scopes, last use, and revoke credentials you no longer trust.
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" className="font-mono" onClick={() => void fetchApiKeys()}>
                <RefreshCw className="h-4 w-4" />
                refresh
              </Button>
            </div>
            <Separator />
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingKeys && (
              <div className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            )}

            {!loadingKeys && keyLoadError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="font-mono">
                  api_key_load_failed
                </AlertTitle>
                <AlertDescription className="space-y-3 font-mono text-xs sm:text-sm">
                  <p>{keyLoadError || 'API key management request failed.'}</p>
                  <Button type="button" variant="outline" size="sm" className="font-mono" onClick={() => void fetchApiKeys()}>
                    retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {!loadingKeys && !keyLoadError && apiKeys.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <p className="font-mono text-sm text-foreground">no_api_keys_yet</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create a narrowly scoped key when you need automation or external integrations.
                </p>
              </div>
            )}

            {!loadingKeys &&
              !keyLoadError &&
              apiKeys.map((apiKey) => {
                const isRevoked = Boolean(apiKey.revokedAt);
                const isExpired = Boolean(apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= Date.now());

                return (
                  <div key={apiKey.id} className="space-y-4 rounded-xl border border-border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-mono text-sm text-foreground">{apiKey.label}</h3>
                          <Badge variant="outline" className="font-mono">
                            {apiKey.keyPrefix}
                          </Badge>
                          {isRevoked && (
                            <Badge variant="destructive" className="font-mono">
                              revoked
                            </Badge>
                          )}
                          {!isRevoked && isExpired && (
                            <Badge variant="secondary" className="font-mono">
                              expired
                            </Badge>
                          )}
                          {!isRevoked && !isExpired && (
                            <Badge variant="secondary" className="font-mono">
                              active
                            </Badge>
                          )}
                        </div>

                        {apiKey.description && <p className="text-sm text-muted-foreground">{apiKey.description}</p>}

                        <div className="flex flex-wrap gap-2">
                          {apiKey.scopes.map((scope) => (
                            <Badge key={scope} variant="purple" className="font-mono">
                              {getScopeLabel(scope)}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="font-mono"
                        disabled={isRevoked}
                        onClick={() => setRevokeTarget(apiKey)}
                      >
                        <Trash2 className="h-4 w-4" />
                        revoke
                      </Button>
                    </div>

                    <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                      <p>
                        <span className="font-mono text-foreground">created:</span> {formatTimestamp(apiKey.createdAt)}
                      </p>
                      <p>
                        <span className="font-mono text-foreground">last_used:</span>{' '}
                        {apiKey.lastUsedAt ? formatRelativeTimestamp(apiKey.lastUsedAt) : 'never'}
                      </p>
                      <p>
                        <span className="font-mono text-foreground">expires:</span> {formatTimestamp(apiKey.expiresAt)}
                      </p>
                      <p>
                        <span className="font-mono text-foreground">vaults:</span>{' '}
                        {apiKey.vaultIds.length === 0 ? 'all accessible' : `${apiKey.vaultIds.length} restricted`}
                      </p>
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent className="border-2 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-xl text-destructive">revoke_api_key?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 font-mono text-sm text-muted-foreground">
                <p>
                  This immediately disables <span className="text-foreground">{revokeTarget?.label}</span>. Existing
                  scripts using that secret will stop working.
                </p>
                <p>The key prefix will remain for audit history, but the credential cannot be restored.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono"
              onClick={handleConfirmRevoke}
              disabled={isRevoking}
            >
              {isRevoking && <Loader2 className="h-4 w-4 animate-spin" />}
              revoke_key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
