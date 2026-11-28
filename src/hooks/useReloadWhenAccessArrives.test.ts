import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReloadWhenAccessArrives } from './useReloadWhenAccessArrives';

type Status = Parameters<typeof useReloadWhenAccessArrives>[0]['accessStatus'];

// Walks the hook through what the vault page sees: [page's vault, access status, vault the
// access answer is about]. A loading answer has no vault yet.
function run(steps: [vaultId: string, status: Status, accessVaultId?: string][]) {
  const reload = vi.fn();
  const props = ([vaultId, accessStatus, accessVaultId]: (typeof steps)[number]) =>
    ({ vaultId, accessStatus, accessVaultId: accessVaultId ?? (accessStatus === 'loading' ? undefined : vaultId), reload });
  const hook = renderHook((p: ReturnType<typeof props>) => useReloadWhenAccessArrives(p), { initialProps: props(steps[0]) });
  for (const step of steps.slice(1)) hook.rerender(props(step));
  return reload;
}

describe('useReloadWhenAccessArrives', () => {
  it('reloads when a share arrives on the request screen', () => {
    expect(run([['v1', 'loading'], ['v1', 'requestable'], ['v1', 'loading'], ['v1', 'granted']])).toHaveBeenCalledTimes(1);
  });

  it('reloads when a pending request is approved', () => {
    expect(run([['v1', 'pending'], ['v1', 'granted']])).toHaveBeenCalledTimes(1);
  });

  it("doesn't reload on the first check of a vault the user can already open", () => {
    expect(run([['v1', 'loading'], ['v1', 'granted']])).not.toHaveBeenCalled();
  });

  it("doesn't reload when a realtime refresh confirms access the user already had", () => {
    expect(run([['v1', 'granted'], ['v1', 'loading'], ['v1', 'granted']])).not.toHaveBeenCalled();
  });

  it("doesn't count the previous vault's answer for the next one", () => {
    // From one request screen to another vault the user can open: no reload.
    expect(run([['v1', 'requestable'], ['v2', 'requestable', 'v1'], ['v2', 'granted']])).not.toHaveBeenCalled();
    // From one request screen to another, where a share then arrives: one reload.
    expect(run([['v1', 'requestable'], ['v2', 'requestable', 'v1'], ['v2', 'requestable'], ['v2', 'loading'], ['v2', 'granted']]))
      .toHaveBeenCalledTimes(1);
  });

  it("doesn't reload after a failed check: the content loaded alongside it", () => {
    expect(run([['v1', 'error'], ['v1', 'loading'], ['v1', 'granted']])).not.toHaveBeenCalled();
  });
});
