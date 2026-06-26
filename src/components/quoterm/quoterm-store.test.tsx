import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { __resetQuotermForTests, getQuotermSourceRect, quoterm, useQuoterm } from './quoterm-store';
import { toast } from '@/hooks/use-toast';

describe('quoterm feedback store', () => {
  afterEach(() => {
    __resetQuotermForTests();
    vi.restoreAllMocks();
  });

  it('stores one Quoterm message and replaces older feedback', async () => {
    const { result } = renderHook(() => useQuoterm());

    quoterm({ title: 'Saved', variant: 'success', sourceRect: new DOMRect(10, 20, 30, 40) });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0]).toMatchObject({ title: 'Saved', variant: 'success', role: 'status', open: true });
    expect(result.current.messages[0].sourceRect?.x).toBe(10);

    quoterm({ title: 'Careful', variant: 'warning' });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0]).toMatchObject({ title: 'Careful', variant: 'warning', role: 'alert' });
  });

  it('dismisses immediately and preserves toast onOpenChange compatibility', async () => {
    const onOpenChange = vi.fn();
    const { result } = renderHook(() => useQuoterm());

    const handle = quoterm({ title: 'Will close', onOpenChange });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    handle.dismiss();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(result.current.messages).toEqual([]);
  });

  it('routes toast API calls through Quoterm severity and title normalization', async () => {
    const { result } = renderHook(() => useQuoterm());

    toast({ title: 'paper_added ✨' });

    await waitFor(() => expect(result.current.messages[0]).toMatchObject({
      title: 'Paper added ✨',
      variant: 'success',
      role: 'status',
    }));

    toast({ title: 'Could not save', variant: 'destructive' });

    await waitFor(() => expect(result.current.messages[0]).toMatchObject({
      title: 'Could not save',
      variant: 'error',
      role: 'alert',
    }));
  });

  it('uses the triggering source element rect when provided', () => {
    const button = document.createElement('button');
    const rect = new DOMRect(5, 6, 7, 8);
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(rect);

    expect(getQuotermSourceRect(button)).toBe(rect);
  });
});
