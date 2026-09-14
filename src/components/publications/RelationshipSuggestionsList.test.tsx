import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('does not show an approve_all button for a single suggestion', () => {
    render(
      <RelationshipSuggestionsList suggestions={[makeSuggestion()]} approvingKey={null} onApprove={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: /approve_all/i })).not.toBeInTheDocument();
  });

  it('approve_all calls onApprove for every suggestion in order', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    const suggestions = [
      makeSuggestion(),
      makeSuggestion({ sourcePublicationId: 'c', targetPublicationId: 'd', sourceTitle: 'Paper C', targetTitle: 'Paper D' }),
    ];
    render(
      <RelationshipSuggestionsList suggestions={suggestions} approvingKey={null} onApprove={onApprove} onDismiss={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /approve_all/i }));

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(2));
    expect(onApprove).toHaveBeenNthCalledWith(1, suggestions[0]);
    expect(onApprove).toHaveBeenNthCalledWith(2, suggestions[1]);
  });

  it('approve_all continues past an individual failure and still approves the rest', async () => {
    const onApprove = vi.fn()
      .mockRejectedValueOnce(new Error('already linked'))
      .mockResolvedValueOnce(undefined);
    const suggestions = [
      makeSuggestion(),
      makeSuggestion({ sourcePublicationId: 'c', targetPublicationId: 'd', sourceTitle: 'Paper C', targetTitle: 'Paper D' }),
    ];
    render(
      <RelationshipSuggestionsList suggestions={suggestions} approvingKey={null} onApprove={onApprove} onDismiss={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /approve_all/i }));

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(2));
  });

  it('disables per-row approve/dismiss buttons while approve_all is running', async () => {
    let resolveFirst: () => void = () => {};
    const onApprove = vi.fn(() => new Promise<void>((resolve) => { resolveFirst = resolve; }));
    const suggestions = [
      makeSuggestion(),
      makeSuggestion({ sourcePublicationId: 'c', targetPublicationId: 'd', sourceTitle: 'Paper C', targetTitle: 'Paper D' }),
    ];
    render(
      <RelationshipSuggestionsList suggestions={suggestions} approvingKey={null} onApprove={onApprove} onDismiss={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /approve_all/i }));

    await waitFor(() => {
      screen.getAllByRole('button', { name: /^dismiss$/i }).forEach((btn) => expect(btn).toBeDisabled());
    });

    resolveFirst();
  });
});
