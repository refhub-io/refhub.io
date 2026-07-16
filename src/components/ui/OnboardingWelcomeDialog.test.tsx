import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingWelcomeDialog } from './OnboardingWelcomeDialog';

describe('OnboardingWelcomeDialog step reset', () => {
  it('resets to step 1 when reopened after navigating forward', () => {
    const onOpenChange = vi.fn();
    const onOpenGuide = vi.fn();
    const { rerender } = render(
      <OnboardingWelcomeDialog open onOpenChange={onOpenChange} onOpenGuide={onOpenGuide} />,
    );

    expect(screen.getByText('create vaults')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText('import and discover')).toBeInTheDocument();

    rerender(
      <OnboardingWelcomeDialog open={false} onOpenChange={onOpenChange} onOpenGuide={onOpenGuide} />,
    );
    rerender(
      <OnboardingWelcomeDialog open onOpenChange={onOpenChange} onOpenGuide={onOpenGuide} />,
    );

    expect(screen.getByText('create vaults')).toBeInTheDocument();
  });
});

describe('OnboardingWelcomeDialog mobile footer layout', () => {
  it('renders the primary action, secondary row, and skip link as three distinct rows', () => {
    const onOpenChange = vi.fn();
    const onOpenGuide = vi.fn();
    render(
      <OnboardingWelcomeDialog open onOpenChange={onOpenChange} onOpenGuide={onOpenGuide} />,
    );

    const footer = screen.getByRole('button', { name: /^next$/i }).closest('footer');
    expect(footer).not.toBeNull();

    const rows = footer!.querySelectorAll(':scope > div');
    expect(rows).toHaveLength(3);

    // Row 1: primary action, full width on mobile
    expect(rows[0]).toHaveClass('w-full');
    expect(rows[0].querySelector('button')).toHaveTextContent(/next/i);

    // Row 2: secondary actions (back always present; "open guide" only on last step)
    expect(rows[1].querySelectorAll('button')).toHaveLength(1);
    expect(rows[1].querySelector('button')).toHaveTextContent(/back/i);

    // Row 3: skip, de-emphasized text link
    expect(rows[2]).toHaveTextContent(/skip/i);
  });
});
