import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import SignupNextSteps from './SignupNextSteps';

function renderAt() {
  render(
    <MemoryRouter initialEntries={['/signup-next-steps']}>
      <Routes>
        <Route path="/signup-next-steps" element={<SignupNextSteps />} />
        <Route path="/auth" element={<p>auth page</p>} />
        <Route path="/vault/:id" element={<p>vault page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: /return_to_login/i }));
}

describe('SignupNextSteps return_to_login()', () => {
  afterEach(() => localStorage.clear());

  it('follows a stored internal redirect', () => {
    localStorage.setItem('redirectAfterLogin', '/vault/abc');
    renderAt();
    expect(screen.getByText('vault page')).toBeInTheDocument();
    expect(localStorage.getItem('redirectAfterLogin')).toBeNull();
  });

  it('goes to /auth instead of following a redirect to another origin', () => {
    localStorage.setItem('redirectAfterLogin', 'https://evil.example/phish');
    renderAt();
    expect(screen.getByText('auth page')).toBeInTheDocument();
  });
});
