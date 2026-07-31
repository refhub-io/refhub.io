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
    // Feature card heading is a short snake_case label (kept short so it never
    // wraps to a second line and throws off the row's vertical alignment),
    // decoupled from the fuller `title`/body copy, so no stray punctuation leaks in.
    expect(screen.getByText('// export')).toBeInTheDocument();
    expect(screen.queryByText(/&/)).not.toBeInTheDocument();
    expect(screen.getByText(/export selections as bibtex, apa, or csv/i)).toBeInTheDocument();
    expect(screen.getByText(/export clean bibtex, apa,\s*or csv/i)).toBeInTheDocument();
  });

  it('mentions hierarchical tagging and markdown notes, split across the vaults and citation graphs cards', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
    expect(screen.getByText(/hierarchical tags/i)).toBeInTheDocument();
    expect(screen.getByText(/markdown notes/i)).toBeInTheDocument();
  });

  it('has a feature card for agentic workflows', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
    expect(screen.getByText('// agentic_workflows')).toBeInTheDocument();
    expect(screen.getByText(/claude skills for the refhub cli and drafting papers/i)).toBeInTheDocument();
  });
});
