import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LoadingSpinner } from './loading';

describe('LoadingSpinner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders as text (not a CSS animate-spin ring) so it cannot visually freeze mid-rotation', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(container.textContent).toMatch(/loading/);
  });

  it('cycles through different words over time, driven by React state rather than CSS animation', () => {
    render(<LoadingSpinner />);
    const first = screen.getByText(/^[a-z]+\.*$/).textContent;

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    const second = screen.getByText(/^[a-z]+\.*$/).textContent;
    expect(second).not.toEqual(first);
  });

  it('applies the requested variant as a text color class', () => {
    const { container } = render(<LoadingSpinner variant="subtle" />);
    expect(container.querySelector('.text-muted-foreground')).not.toBeNull();
  });
});
