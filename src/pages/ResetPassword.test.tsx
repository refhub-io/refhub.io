import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } }, error: null }),
      updateUser: () => Promise.resolve({ data: {}, error: null }),
    },
  },
}));
// One toast function, like the real hook: the page re-checks the recovery session whenever it changes.
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

import ResetPassword from './ResetPassword';

/** Opens the page in a recovery session, sets a new password and presses return_to_login(). */
async function resetAndReturnToLogin() {
  sessionStorage.setItem('passwordRecovery', 'true');
  render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth" element={<p>auth page</p>} />
        <Route path="/vault/:id" element={<p>vault page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  const newPassword = await screen.findByLabelText('new_password');
  fireEvent.change(newPassword, { target: { value: 'test-password-123' } });
  fireEvent.change(screen.getByLabelText('confirm_password'), { target: { value: 'test-password-123' } });
  fireEvent.submit(newPassword.closest('form')!);
  fireEvent.click(await screen.findByRole('button', { name: /return_to_login/i }));
}

describe('ResetPassword return_to_login()', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('follows a stored internal redirect', async () => {
    localStorage.setItem('redirectAfterLogin', '/vault/abc');
    await resetAndReturnToLogin();
    expect(screen.getByText('vault page')).toBeInTheDocument();
    expect(localStorage.getItem('redirectAfterLogin')).toBeNull();
  });

  it('goes to /auth instead of following a redirect to another origin', async () => {
    localStorage.setItem('redirectAfterLogin', 'https://evil.example/phish');
    await resetAndReturnToLogin();
    expect(screen.getByText('auth page')).toBeInTheDocument();
  });
});
