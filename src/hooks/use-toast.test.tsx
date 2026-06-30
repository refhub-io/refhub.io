import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dismissQuoterm, getQuotermsSnapshot } from 'quoterm';

import { toast, useToast } from './use-toast';

describe('RefHub toast to Quoterm adapter', () => {
  afterEach(() => {
    dismissQuoterm();
  });

  it('routes toast calls through the quoterm package with RefHub title and severity normalization', async () => {
    await act(async () => {
      toast({ title: 'paper_added ✨', duration: 0 });
    });

    const { result, unmount } = renderHook(() => useToast());

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      title: 'Paper added ✨',
      feedbackSeverity: 'success',
      variant: 'default',
    });
    expect(getQuotermsSnapshot().items[0]).toMatchObject({
      title: 'Paper added ✨',
      variant: 'success',
    });
    unmount();

    await act(async () => {
      toast({ title: 'Could not save', variant: 'destructive', duration: 0 });
    });

    expect(getQuotermsSnapshot().items[0]).toMatchObject({
      title: 'Could not save',
      variant: 'error',
    });
  });

  it('passes explicit Save and Sync control refs as Quoterm package sources', async () => {
    const saveButton = document.createElement('button');
    const syncButton = document.createElement('button');
    saveButton.dataset.quotermAnchor = 'publication-save';
    syncButton.dataset.quotermAnchor = 'publication-sync';
    document.body.append(saveButton, syncButton);

    try {
      await act(async () => {
        toast({ title: 'Paper updated ✨', source: { current: saveButton }, duration: 0 });
      });

      expect(getQuotermsSnapshot().items[0]).toMatchObject({
        title: 'Paper updated ✨',
        sourceElement: saveButton,
        variant: 'success',
      });

      await act(async () => {
        toast({ title: 'Semantic Scholar sync failed', variant: 'destructive', feedbackSeverity: 'error', source: { current: syncButton }, duration: 0 });
      });

      expect(getQuotermsSnapshot().items[0]).toMatchObject({
        title: 'Semantic Scholar sync failed',
        sourceElement: syncButton,
        variant: 'error',
      });
    } finally {
      saveButton.remove();
      syncButton.remove();
    }
  });

  it('returns handles that update and dismiss package feedback', async () => {
    let handle: ReturnType<typeof toast>;

    await act(async () => {
      handle = toast({ title: 'Saving', duration: 0 });
    });

    await act(async () => {
      handle.update({ id: handle.id, title: 'Already exists', feedbackSeverity: 'warning' });
    });

    expect(getQuotermsSnapshot().items[0]).toMatchObject({
      title: 'Already exists',
      variant: 'warning',
      role: 'alert',
    });

    await act(async () => {
      handle.dismiss();
    });

    expect(getQuotermsSnapshot().items).toHaveLength(0);
  });
});
