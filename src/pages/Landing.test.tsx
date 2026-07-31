import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from './Landing';

describe('Landing', () => {
  it('renders without requiring authentication and shows a sign-in CTA', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
    expect(screen.getByText(/get_started/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThan(0);
  });

  it('links to the codex and legal pages', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /explore the codex/i })).toHaveAttribute('href', '/codex');
    expect(screen.getByRole('link', { name: 'privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'terms' })).toHaveAttribute('href', '/tos');
  });
});
