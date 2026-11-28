import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebouncedValue', () => {
  it('follows the value only once it has stopped changing for the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), { initialProps: { value: 'g' } });
    expect(result.current).toBe('g');

    rerender({ value: 'gr' });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ value: 'graph' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe('g');

    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe('graph');
  });
});
