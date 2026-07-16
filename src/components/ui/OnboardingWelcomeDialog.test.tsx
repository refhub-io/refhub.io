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
