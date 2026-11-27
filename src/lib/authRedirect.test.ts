import { afterEach, describe, expect, it } from 'vitest';
import { consumeStoredRedirectAfterLogin, getStoredRedirectAfterLogin, storeRedirectAfterLogin } from './authRedirect';

describe('stored post-login redirect', () => {
  afterEach(() => localStorage.clear());

  it('stores and consumes an internal path', () => {
    storeRedirectAfterLogin('/vault/abc');
    expect(consumeStoredRedirectAfterLogin()).toBe('/vault/abc');
    expect(getStoredRedirectAfterLogin()).toBeNull();
  });

  it('refuses to store another origin', () => {
    storeRedirectAfterLogin('https://evil.example/phish');
    expect(localStorage.getItem('redirectAfterLogin')).toBeNull();
  });

  it('ignores another origin that was written to storage directly', () => {
    localStorage.setItem('redirectAfterLogin', '//evil.example/phish');
    expect(consumeStoredRedirectAfterLogin()).toBeNull();
    expect(localStorage.getItem('redirectAfterLogin')).toBeNull();
  });
});
