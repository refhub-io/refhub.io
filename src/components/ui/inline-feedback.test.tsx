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

  it('renders product-facing fallback feedback without command chrome', async () => {
    const user = userEvent.setup();
    render(<InlineFeedbackHost />);

    await act(async () => {
      quoterm({ title: 'Imported 2 papers', description: 'Added to Reading list', variant: 'success', source: null, duration: 0 });
    });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Imported 2 papers'));
    expect(screen.getByRole('status')).toHaveTextContent('Added to Reading list');
    expect(document.querySelector('.quoterm__command')).not.toBeInTheDocument();
    expect(document.querySelector('.quoterm__variant')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('quoterm', 'quoterm--success');
    expect(document.querySelector('[data-quoterm="fallback-slot"]')).toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /dismiss feedback/i }));
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('inserts source-element feedback into the local layout', async () => {
    const source = document.createElement('button');
    document.body.appendChild(source);
    const rect = new DOMRect(20, 30, 96, 40);
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(rect);
    render(<InlineFeedbackHost />);

    await act(async () => {
      quoterm({ title: 'Anchored save', source, duration: 0 });
    });

    const inlineSlot = await waitFor(() => document.querySelector('[data-quoterm="inline-slot"]'));
    expect(inlineSlot).toBeInTheDocument();
    expect(inlineSlot).toHaveAttribute('data-quoterm-placement', 'before');
    expect(source.previousElementSibling).toBe(inlineSlot);
    expect(screen.getByRole('status')).toHaveStyle({ maxWidth: '360px' });

    source.remove();
  });
});
