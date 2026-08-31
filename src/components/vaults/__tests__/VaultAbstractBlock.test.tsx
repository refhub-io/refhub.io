import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import VaultAbstractBlock from '../VaultAbstractBlock';

describe('VaultAbstractBlock', () => {
  it('renders both the tagline (description) and the abstract when both are present', () => {
    render(<VaultAbstractBlock abstract="Graph drawing starter pack." description="A short tagline" />);
    expect(screen.getByText('A short tagline')).toBeInTheDocument();
    expect(screen.getByText('Graph drawing starter pack.')).toBeInTheDocument();
  });

  it('renders only the description when there is no abstract', () => {
    render(<VaultAbstractBlock abstract={null} description="Weekly reading list" />);
    expect(screen.getByText('Weekly reading list')).toBeInTheDocument();
    expect(screen.queryByText('// abstract')).not.toBeInTheDocument();
  });

  it('renders only the abstract when there is no description', () => {
    render(<VaultAbstractBlock abstract="Contents and purpose." description={null} />);
    expect(screen.getByText('Contents and purpose.')).toBeInTheDocument();
    expect(screen.queryByText('// tagline')).not.toBeInTheDocument();
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
