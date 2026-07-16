import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { getOnboardingStorageKey, restartOnboarding, useOnboarding } from './useOnboarding';

const fakeUser = { id: 'user-123' } as User;

describe('useOnboarding restart', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts closed when the user already dismissed onboarding', () => {
    const storageKey = getOnboardingStorageKey(fakeUser.id);
    localStorage.setItem(storageKey, 'true');

    const { result } = renderHook(() => useOnboarding(fakeUser, false));

    expect(result.current.open).toBe(false);
  });

  it('clears the dismissal flag and reopens when restartOnboarding() is called', () => {
    const storageKey = getOnboardingStorageKey(fakeUser.id);
    localStorage.setItem(storageKey, 'true');

    const { result } = renderHook(() => useOnboarding(fakeUser, false));
    expect(result.current.open).toBe(false);

    act(() => {
      restartOnboarding();
    });

    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(result.current.open).toBe(true);
  });

  it('does nothing when no user is signed in', () => {
    const { result } = renderHook(() => useOnboarding(null, false));

    act(() => {
      restartOnboarding();
    });

    expect(result.current.open).toBe(false);
  });
});
