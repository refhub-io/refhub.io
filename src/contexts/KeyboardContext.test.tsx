import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeyboardProvider, useKeyboardContext } from './KeyboardContext';

describe('KeyboardContext help overlay tabs', () => {
  it('opens directly to the resources and ai-workflows tabs', () => {
    const { result } = renderHook(() => useKeyboardContext(), {
      wrapper: KeyboardProvider,
    });

    act(() => {
      result.current.openHelpOverlay('resources');
    });
    expect(result.current.helpOverlayTab).toBe('resources');
    expect(result.current.helpOverlayOpen).toBe(true);

    act(() => {
      result.current.openHelpOverlay('ai-workflows');
    });
    expect(result.current.helpOverlayTab).toBe('ai-workflows');
  });
});
