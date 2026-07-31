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

  it('points the brand mark at the site root, not the page it is already on', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /refhub\.io/i })).toHaveAttribute('href', '/');
  });

  it('markets csv alongside bibtex and apa in the feature card and hero copy', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
    // Feature card heading is a snake_case label, so no stray punctuation leaks in.
    expect(screen.getByText('// bibtex_apa_csv_export')).toBeInTheDocument();
    expect(screen.queryByText(/&/)).not.toBeInTheDocument();
    expect(screen.getByText(/export selections as bibtex, apa, or csv/i)).toBeInTheDocument();
    expect(screen.getByText(/export clean bibtex, apa,\s*or csv/i)).toBeInTheDocument();
  });
});
