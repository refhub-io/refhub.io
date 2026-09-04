import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import VaultAccessBadge from './VaultAccessBadge';

describe('VaultAccessBadge', () => {
  it('shows an owner badge', () => {
    render(<VaultAccessBadge permission="owner" />);
    expect(screen.getByText('owner')).toBeInTheDocument();
  });

  it('shows an editor badge', () => {
    render(<VaultAccessBadge permission="editor" />);
    expect(screen.getByText('editor')).toBeInTheDocument();
  });

  it('shows a viewer badge', () => {
    render(<VaultAccessBadge permission="viewer" />);
    expect(screen.getByText('viewer')).toBeInTheDocument();
  });

  it('renders nothing when permission is not yet resolved', () => {
    const { container } = render(<VaultAccessBadge permission={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
