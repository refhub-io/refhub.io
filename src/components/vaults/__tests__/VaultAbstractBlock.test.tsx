import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import VaultAbstractBlock from '../VaultAbstractBlock';

describe('VaultAbstractBlock', () => {
  it('renders the abstract when present', () => {
    render(<VaultAbstractBlock abstract="Graph drawing starter pack." description="tagline" />);
    expect(screen.getByText('Graph drawing starter pack.')).toBeInTheDocument();
  });

  it('falls back to the description when there is no abstract', () => {
    render(<VaultAbstractBlock abstract={null} description="Weekly reading list" />);
    expect(screen.getByText('Weekly reading list')).toBeInTheDocument();
  });

  it('shows a placeholder statement when neither abstract nor description is set', () => {
    render(<VaultAbstractBlock abstract={null} description={null} />);
    expect(screen.getByText('// no_description_provided')).toBeInTheDocument();
  });

  it('treats an empty string the same as a missing value', () => {
    render(<VaultAbstractBlock abstract="" description="" />);
    expect(screen.getByText('// no_description_provided')).toBeInTheDocument();
  });
});
