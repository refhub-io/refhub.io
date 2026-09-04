import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VaultRelationshipsPanel } from './VaultRelationshipsPanel';
import type { RelationshipSuggestion } from '@/lib/relationshipSuggestions';

function makeSuggestion(overrides: Partial<RelationshipSuggestion> = {}): RelationshipSuggestion {
  return {
    sourcePublicationId: 'a', sourceTitle: 'A', targetPublicationId: 'b', targetTitle: 'B',
    discoveredVia: 'references', ...overrides,
  };
}

describe('VaultRelationshipsPanel', () => {
  it('calls onScan(false) when the scan button is clicked', () => {
    const onScan = vi.fn();
    render(
      <VaultRelationshipsPanel
        suggestions={[]} scanning={false} progress={null} approvingKey={null}
        onScan={onScan} onApprove={() => {}} onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /scan for relationships/i }));
    expect(onScan).toHaveBeenCalledWith(false);
  });

  it('calls onScan(true) when the force_rescan button is clicked, bypassing the skip-cache', () => {
    const onScan = vi.fn();
    render(
      <VaultRelationshipsPanel
        suggestions={[]} scanning={false} progress={null} approvingKey={null}
        onScan={onScan} onApprove={() => {}} onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /force_rescan/i }));
    expect(onScan).toHaveBeenCalledWith(true);
  });

  it('renders suggestions passed in as props', () => {
    render(
      <VaultRelationshipsPanel
        suggestions={[makeSuggestion()]} scanning={false} progress={null} approvingKey={null}
        onScan={() => {}} onApprove={() => {}} onDismiss={() => {}}
      />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('disables the scan button and shows progress while scanning', () => {
    render(
      <VaultRelationshipsPanel
        suggestions={[]} scanning={true} progress={{ completed: 1, total: 4, active: 1, succeeded: 1, failed: 0, rateLimited: 0 }} approvingKey={null}
        onScan={() => {}} onApprove={() => {}} onDismiss={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /scanning/i })).toBeDisabled();
    expect(screen.getByText('1/4_done')).toBeInTheDocument();
  });

  it('calls onApprove/onDismiss with the suggestion clicked', () => {
    const onApprove = vi.fn();
    const onDismiss = vi.fn();
    const suggestion = makeSuggestion();
    render(
      <VaultRelationshipsPanel
        suggestions={[suggestion]} scanning={false} progress={null} approvingKey={null}
        onScan={() => {}} onApprove={onApprove} onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledWith(suggestion);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledWith(suggestion);
  });
});
