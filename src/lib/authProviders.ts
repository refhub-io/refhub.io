import { User } from '@supabase/supabase-js';

export type SupportedOAuthProvider = 'google' | 'github';

const LAST_LOGIN_PROVIDER_KEY = 'lastLoginProvider';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isSupportedOAuthProvider(value: unknown): value is SupportedOAuthProvider {
  return value === 'google' || value === 'github';
}

export function getUserAuthProvider(user: User | null | undefined): SupportedOAuthProvider | null {
  const provider = user?.app_metadata?.provider;
  return isSupportedOAuthProvider(provider) ? provider : null;
}

export function persistLastLoginProvider(provider: SupportedOAuthProvider | null) {
  if (typeof window === 'undefined') return;

  if (provider) {
    localStorage.setItem(LAST_LOGIN_PROVIDER_KEY, provider);
    return;
  }

  localStorage.removeItem(LAST_LOGIN_PROVIDER_KEY);
}

export function getPersistedLastLoginProvider(): SupportedOAuthProvider | null {
  if (typeof window === 'undefined') return null;

  const provider = localStorage.getItem(LAST_LOGIN_PROVIDER_KEY);
  return isSupportedOAuthProvider(provider) ? provider : null;
}

export function getAuthProviderLabel(provider: SupportedOAuthProvider): string {
  return provider === 'google' ? 'Google' : 'GitHub';
}

export function getLastLoginProvider(user: User | null | undefined): SupportedOAuthProvider | null {
  return getUserAuthProvider(user) ?? getPersistedLastLoginProvider();
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
