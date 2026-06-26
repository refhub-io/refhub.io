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
  it('uses activeElement as the fallback source before viewport fallback', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    const rect = new DOMRect(11, 12, 13, 14);
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(rect);

    expect(getQuotermSourceRect()).toBe(rect);

    button.remove();
  });

  it('captures explicit Save and Sync control refs as Quoterm sources', async () => {
    const { result } = renderHook(() => useQuoterm());
    const saveButton = document.createElement('button');
    saveButton.dataset.quotermAnchor = 'publication-save';
    const syncButton = document.createElement('button');
    syncButton.dataset.quotermAnchor = 'publication-sync';
    const saveRect = new DOMRect(100, 200, 80, 32);
    const syncRect = new DOMRect(24, 48, 120, 28);
    vi.spyOn(saveButton, 'getBoundingClientRect').mockReturnValue(saveRect);
    vi.spyOn(syncButton, 'getBoundingClientRect').mockReturnValue(syncRect);

    toast({ title: 'Paper updated ✨', source: { current: saveButton } });
    await waitFor(() => expect(result.current.messages[0].sourceRect).toBe(saveRect));

    toast({ title: 'Semantic Scholar sync failed', variant: 'destructive', feedbackSeverity: 'error', source: { current: syncButton } });
    await waitFor(() => expect(result.current.messages[0]).toMatchObject({
      title: 'Semantic Scholar sync failed',
      variant: 'error',
      role: 'alert',
    }));
    expect(result.current.messages[0].sourceRect).toBe(syncRect);
  });
});
