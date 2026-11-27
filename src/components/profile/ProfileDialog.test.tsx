import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Stable objects, like the real hooks return: the dialog resets its form when the profile changes.
const { user, profile, updateProfile } = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'ada@example.org' },
  profile: {
    id: 'profile-1', user_id: 'user-1', display_name: 'Ada Lovelace', username: 'ada', bio: null,
    github_url: null, linkedin_url: null, bluesky_url: null, avatar_url: null, email: 'ada@example.org',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', is_setup: true,
  },
  updateProfile: vi.fn(async (_updates: Record<string, unknown>, _options?: unknown) => ({ error: null })),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user, signOut: vi.fn() }) }));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile, updateProfile, checkUsernameAvailable: async () => true }),
}));

import { ProfileDialog } from './ProfileDialog';

async function saveWithGithubLink(value: string) {
  render(<MemoryRouter><ProfileDialog open onOpenChange={vi.fn()} /></MemoryRouter>);
  const field = await screen.findByPlaceholderText('https://github.com/username');
  fireEvent.change(field, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /save_profile/ }));
}

describe('ProfileDialog profile links', () => {
  beforeEach(() => updateProfile.mockClear());

  it('rejects a link that is not http(s) and saves nothing', async () => {
    await saveWithGithubLink('javascript:alert(1)');

    expect(await screen.findByText('use an http:// or https:// link')).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('saves an http(s) link, trimmed and normalized', async () => {
    await saveWithGithubLink('  https://github.com/ada  ');

    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    expect(updateProfile.mock.calls[0][0]).toMatchObject({
      github_url: 'https://github.com/ada', linkedin_url: null, bluesky_url: null,
    });
  });
});
