import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RelationshipSuggestionsList } from './RelationshipSuggestionsList';
import type { RelationshipSuggestion } from '@/lib/relationshipSuggestions';

function makeSuggestion(overrides: Partial<RelationshipSuggestion> = {}): RelationshipSuggestion {
  return {
    sourcePublicationId: 'a', sourceTitle: 'Paper A',
    targetPublicationId: 'b', targetTitle: 'Paper B',
    discoveredVia: 'references',
    ...overrides,
  };
}

describe('RelationshipSuggestionsList', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(
      <RelationshipSuggestionsList suggestions={[]} approvingKey={null} onApprove={() => {}} onDismiss={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "source cites target" for each suggestion', () => {
    render(
      <RelationshipSuggestionsList
        suggestions={[makeSuggestion()]}
        approvingKey={null}
        onApprove={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText('Paper A')).toBeInTheDocument();
    expect(screen.getByText(/cites/)).toBeInTheDocument();
    expect(screen.getByText('Paper B')).toBeInTheDocument();
  });

  it('calls onApprove with the suggestion when its approve button is clicked', () => {
    const onApprove = vi.fn();
    const suggestion = makeSuggestion();
    render(
      <RelationshipSuggestionsList suggestions={[suggestion]} approvingKey={null} onApprove={onApprove} onDismiss={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledWith(suggestion);
  });

  it('calls onDismiss with the suggestion when its dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    const suggestion = makeSuggestion();
    render(
      <RelationshipSuggestionsList suggestions={[suggestion]} approvingKey={null} onApprove={() => {}} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledWith(suggestion);
  });

  it('disables the approve button for the suggestion currently being approved', () => {
    render(
      <RelationshipSuggestionsList
        suggestions={[makeSuggestion()]}
        approvingKey="a:b"
        onApprove={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
  });
});
