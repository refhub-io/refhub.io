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

describe('OnboardingWelcomeDialog footer layout', () => {
  it('splits back/next evenly on top and puts skip alone on the bottom row on the first step', () => {
    const onOpenChange = vi.fn();
    const onOpenGuide = vi.fn();
    render(
      <OnboardingWelcomeDialog open onOpenChange={onOpenChange} onOpenGuide={onOpenGuide} />,
    );

    const footer = screen.getByRole('button', { name: /^next$/i }).closest('footer');
    expect(footer).not.toBeNull();

    const rows = footer!.querySelectorAll(':scope > div');
    expect(rows).toHaveLength(2);

    // Row 1: back + next, equal-width flex children
    const topButtons = rows[0].querySelectorAll('button');
    expect(topButtons).toHaveLength(2);
    expect(topButtons[0]).toHaveTextContent(/back/i);
    expect(topButtons[0]).toHaveClass('flex-1');
    expect(topButtons[1]).toHaveTextContent(/next/i);
    expect(topButtons[1]).toHaveClass('flex-1');

    // Row 2: skip only (no "open guide" until the last step)
    expect(rows[1].querySelectorAll('button')).toHaveLength(1);
    expect(rows[1].querySelector('button')).toHaveTextContent(/skip/i);
  });

  it('replaces next with open app and adds open guide bottom-right on the last step', () => {
    const onOpenChange = vi.fn();
    const onOpenGuide = vi.fn();
    render(
      <OnboardingWelcomeDialog open onOpenChange={onOpenChange} onOpenGuide={onOpenGuide} />,
    );

    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    }

    const footer = screen.getByRole('button', { name: /^open app$/i }).closest('footer');
    expect(footer).not.toBeNull();

    const rows = footer!.querySelectorAll(':scope > div');
    expect(rows).toHaveLength(2);

    // Row 1: back + open app (replacing next), still equal width
    const topButtons = rows[0].querySelectorAll('button');
    expect(topButtons).toHaveLength(2);
    expect(topButtons[0]).toHaveTextContent(/back/i);
    expect(topButtons[1]).toHaveTextContent(/^open app$/i);
    expect(topButtons[1]).toHaveClass('flex-1');

    // Row 2: skip (left) and open guide (right)
    const bottomButtons = rows[1].querySelectorAll('button');
    expect(bottomButtons).toHaveLength(2);
    expect(bottomButtons[0]).toHaveTextContent(/skip/i);
    expect(bottomButtons[1]).toHaveTextContent(/open guide/i);
  });
});
