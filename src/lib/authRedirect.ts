import type { Profile } from '@/types/database';

const REDIRECT_AFTER_LOGIN_KEY = 'redirectAfterLogin';

function normalizeInternalPath(candidate: string | null): string | null {
  if (!candidate) return null;

  if (candidate.startsWith('/') && !candidate.startsWith('//')) {
    return candidate;
  }

  try {
    const url = new URL(candidate, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/')) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function getStoredRedirectAfterLogin() {
  if (typeof window === 'undefined') return null;
  return normalizeInternalPath(localStorage.getItem(REDIRECT_AFTER_LOGIN_KEY));
}

export function consumeStoredRedirectAfterLogin() {
  if (typeof window === 'undefined') return null;

  const redirect = getStoredRedirectAfterLogin();
  localStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY);
  return redirect;
}

export function resolvePostAuthRedirect(
  profile: Pick<Profile, 'is_setup'> | null | undefined,
  options: {
    consumeStoredRedirect?: boolean;
    fallbackPath?: string;
    setupPath?: string;
  } = {}
) {
  const {
    consumeStoredRedirect = true,
    fallbackPath = '/',
    setupPath = '/profile-edit',
  } = options;

  const redirectAfterLogin = consumeStoredRedirect
    ? consumeStoredRedirectAfterLogin()
    : getStoredRedirectAfterLogin();

  if (redirectAfterLogin) {
    return redirectAfterLogin;
  }

  if (profile?.is_setup === false) {
    return setupPath;
  }

  return fallbackPath;
}
