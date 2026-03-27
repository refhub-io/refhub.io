import { User } from '@supabase/supabase-js';

export type SupportedAuthProvider = 'google' | 'github' | 'email';
export type SupportedOAuthProvider = Extract<SupportedAuthProvider, 'google' | 'github'>;

const LAST_LOGIN_PROVIDER_KEY = 'lastLoginProvider';
const LAST_LOGIN_PROVIDER_PENDING_KEY = 'lastLoginProviderPending';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isSupportedAuthProvider(value: unknown): value is SupportedAuthProvider {
  return value === 'google' || value === 'github' || value === 'email';
}

export function isSupportedOAuthProvider(value: unknown): value is SupportedOAuthProvider {
  return value === 'google' || value === 'github';
}

export function getUserAuthProvider(user: User | null | undefined): SupportedOAuthProvider | null {
  const appProvider = user?.app_metadata?.provider;
  if (isSupportedOAuthProvider(appProvider)) {
    return appProvider;
  }

  const appProviders = Array.isArray(user?.app_metadata?.providers)
    ? user?.app_metadata?.providers
    : [];
  const matchedAppProvider = appProviders.find(isSupportedOAuthProvider);
  if (matchedAppProvider) {
    return matchedAppProvider;
  }

  const identities = Array.isArray(user?.identities) ? user.identities : [];
  const matchedIdentityProvider = identities
    .map((identity) => identity.provider)
    .find(isSupportedOAuthProvider);

  return matchedIdentityProvider ?? null;
}

export function persistLastLoginProvider(provider: SupportedAuthProvider | null) {
  if (typeof window === 'undefined') return;

  if (provider) {
    localStorage.setItem(LAST_LOGIN_PROVIDER_KEY, provider);
  } else {
    localStorage.removeItem(LAST_LOGIN_PROVIDER_KEY);
  }
}

export function persistPendingLastLoginProvider(provider: SupportedOAuthProvider | null) {
  if (typeof window === 'undefined') return;

  if (provider) {
    localStorage.setItem(LAST_LOGIN_PROVIDER_PENDING_KEY, provider);
  } else {
    localStorage.removeItem(LAST_LOGIN_PROVIDER_PENDING_KEY);
  }
}

export function consumePendingLastLoginProvider(): SupportedOAuthProvider | null {
  if (typeof window === 'undefined') return null;

  const provider = localStorage.getItem(LAST_LOGIN_PROVIDER_PENDING_KEY);

  if (!isSupportedOAuthProvider(provider)) {
    localStorage.removeItem(LAST_LOGIN_PROVIDER_PENDING_KEY);
    return null;
  }

  localStorage.removeItem(LAST_LOGIN_PROVIDER_PENDING_KEY);
  return provider;
}

export function getPersistedLastLoginProvider(): SupportedAuthProvider | null {
  if (typeof window === 'undefined') return null;

  const provider = localStorage.getItem(LAST_LOGIN_PROVIDER_KEY);
  return isSupportedAuthProvider(provider) ? provider : null;
}

export function getAuthProviderLabel(provider: SupportedAuthProvider): string {
  if (provider === 'google') return 'Google';
  if (provider === 'github') return 'GitHub';
  return 'Email';
}

export function getLastLoginProvider(user: User | null | undefined): SupportedAuthProvider | null {
  return getPersistedLastLoginProvider() ?? getUserAuthProvider(user);
}


export function hasPasswordIdentity(user: User | null | undefined): boolean {
  const identities = user?.identities;

  if (!identities || identities.length === 0) {
    return !getUserAuthProvider(user);
  }

  return identities.some((identity) => identity.provider === 'email');
}

export function extractAuthProfileMetadata(user: User) {
  const metadata = user.user_metadata ?? {};
  const displayName = [
    metadata.display_name,
    metadata.full_name,
    metadata.name,
    metadata.user_name,
    metadata.preferred_username,
    metadata.login,
  ].find(isNonEmptyString);

  const avatarUrl = [
    metadata.avatar_url,
    metadata.picture,
    metadata.photo_url,
    metadata.avatar,
  ].find(isNonEmptyString);

  return {
    provider: getUserAuthProvider(user),
    displayName,
    avatarUrl,
  };
}
