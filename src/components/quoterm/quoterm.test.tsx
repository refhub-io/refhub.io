import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuotermHost } from './quoterm';
import { __resetQuotermForTests, quoterm } from './quoterm-store';

describe('QuotermHost', () => {
  afterEach(() => {
    __resetQuotermForTests();
    vi.restoreAllMocks();
  });

  it('renders toast-compatible feedback with CLI prompt styling and dismiss control', async () => {
    const user = userEvent.setup();
    const sourceRect = new DOMRect(20, 30, 120, 40);
    const { rerender } = render(<QuotermHost commandName="refhub feedback" defaultDuration={0} />);

    quoterm({ title: 'Imported 2 papers', description: 'Added to Reading list', variant: 'success', sourceRect });
    rerender(<QuotermHost commandName="refhub feedback" defaultDuration={0} />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Imported 2 papers'));
    expect(screen.getByRole('status')).toHaveTextContent('Added to Reading list');
    expect(screen.getByText('$ refhub feedback --success')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /dismiss feedback/i }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('auto-dismisses messages after the configured duration', async () => {
    vi.useFakeTimers();
    const { rerender } = render(<QuotermHost defaultDuration={50} />);

    await act(async () => {
      quoterm({ title: 'Saved' });
    });
    rerender(<QuotermHost defaultDuration={50} />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');

    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    rerender(<QuotermHost defaultDuration={50} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
