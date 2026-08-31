import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAuth } from './useAuth';
import { useProfile, profileQueryKey } from './useProfile';
import { ensureProfileExists } from '@/lib/profile';
import type { Profile } from '@/types/database';

vi.mock('./useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/profile', () => ({ ensureProfileExists: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }),
  },
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedEnsureProfileExists = vi.mocked(ensureProfileExists);

const fakeUser = { id: 'user-1', email: 'a@b.com' } as User;

const profile: Profile = {
  id: 'p1', user_id: 'user-1', display_name: 'Ada', email: 'a@b.com',
  avatar_url: 'https://example.com/a.png', username: 'ada', bio: null,
  github_url: null, linkedin_url: null, bluesky_url: null, is_setup: true,
  created_at: 'now', updated_at: 'now',
};

function makeWrapper() {
  // Mirrors src/lib/queryClient.ts's real staleTime — this is what actually
  // prevents a second mounted page from re-fetching within the window; a
  // bare default QueryClient (staleTime: 0) would refetch on every mount
  // regardless of cache and wouldn't exercise the behavior being tested.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useProfile', () => {
  beforeEach(() => {
    mockedEnsureProfileExists.mockReset();
  });

  it('returns null, non-loading when no user is signed in', () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: false } as ReturnType<typeof useAuth>);
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useProfile(), { wrapper });

    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockedEnsureProfileExists).not.toHaveBeenCalled();
  });

  it('fetches and returns the profile for a signed-in user', async () => {
    mockedUseAuth.mockReturnValue({ user: fakeUser, loading: false } as ReturnType<typeof useAuth>);
    mockedEnsureProfileExists.mockResolvedValue(profile);
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useProfile(), { wrapper });
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toEqual(profile);
  });

  it('falls back to null (not an error state) when the fetch throws', async () => {
    mockedUseAuth.mockReturnValue({ user: fakeUser, loading: false } as ReturnType<typeof useAuth>);
    mockedEnsureProfileExists.mockRejectedValue(new Error('network blip'));
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toBeNull();
  });

  it('shares the cached profile across two hook instances for the same user', async () => {
    mockedUseAuth.mockReturnValue({ user: fakeUser, loading: false } as ReturnType<typeof useAuth>);
    mockedEnsureProfileExists.mockResolvedValue(profile);
    const { wrapper, queryClient } = makeWrapper();

    const { result: first } = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(first.current.loading).toBe(false));
    expect(mockedEnsureProfileExists).toHaveBeenCalledTimes(1);

    // A second hook instance for the same user (e.g. a different page after
    // navigation) reads the already-cached data instead of refetching from
    // an empty state — this is the whole point of moving to react-query.
    const { result: second } = renderHook(() => useProfile(), { wrapper });
    expect(second.current.profile).toEqual(profile);
    expect(second.current.loading).toBe(false);
    expect(mockedEnsureProfileExists).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(profileQueryKey('user-1'))).toEqual(profile);
  });
});
