import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissQuoterm, quoterm } from 'quoterm';

import { InlineFeedbackHost } from './inline-feedback';

describe('InlineFeedbackHost', () => {
  afterEach(() => {
    act(() => {
      dismissQuoterm();
    });
    vi.restoreAllMocks();
  });

  it('renders quoterm package fallback feedback with RefHub command formatting', async () => {
    const user = userEvent.setup();
    render(<InlineFeedbackHost commandName="refhub feedback" />);

    await act(async () => {
      quoterm({ title: 'Imported 2 papers', description: 'Added to Reading list', variant: 'success', source: null, duration: 0 });
    });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Imported 2 papers'));
    expect(screen.getByRole('status')).toHaveTextContent('Added to Reading list');
    expect(screen.getByText('$ refhub feedback --success')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('quoterm', 'quoterm--success');
    expect(document.querySelector('[data-quoterm="fallback-slot"]')).toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /dismiss feedback/i }));
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('uses the quoterm package inline source-element banner instead of stale centered positioning', async () => {
    const source = document.createElement('button');
    document.body.appendChild(source);
    const rect = new DOMRect(20, 30, 240, 40);
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(rect);
    render(<InlineFeedbackHost commandName="refhub feedback" />);

    await act(async () => {
      quoterm({ title: 'Anchored save', source, duration: 0 });
    });

    const inlineSlot = await waitFor(() => document.querySelector('[data-quoterm="inline-slot"]'));
    expect(inlineSlot).toBeInTheDocument();
    expect(inlineSlot).toHaveAttribute('data-quoterm-placement', 'before');
    expect(inlineSlot).toHaveStyle({ position: 'fixed', left: '20px', width: '240px' });
    expect(screen.getByRole('status')).toHaveStyle({ maxWidth: '240px' });

    source.remove();
  });
});
