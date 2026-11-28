import { useEffect, useRef } from 'react';

type AccessStatus = 'granted' | 'denied' | 'pending' | 'requestable' | 'loading' | 'error';

/**
 * Reloads a vault's content when access to it arrives while the page is open: someone shares the
 * vault, or approves a request, and useVaultAccess's realtime refresh reports it. The content
 * loads alongside the first access check, under the access the user had then, so without this
 * the vault stayed empty until a reload.
 *
 * accessVaultId is the vault useVaultAccess's answer is about. Right after a switch to another
 * vault it still holds the previous vault's answer, and that answer mustn't count for this one.
 */
export function useReloadWhenAccessArrives({ vaultId, accessStatus, accessVaultId, reload }: {
  vaultId: string | undefined;
  accessStatus: AccessStatus;
  accessVaultId: string | undefined;
  reload: () => unknown;
}) {
  // The last settled answer, and the vault it was for. A check in progress isn't an answer.
  const lastSettled = useRef<{ vaultId: string; status: AccessStatus } | null>(null);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!vaultId || accessStatus === 'loading' || accessVaultId !== vaultId) return;
    const before = lastSettled.current?.vaultId === vaultId ? lastSettled.current.status : null;
    lastSettled.current = { vaultId, status: accessStatus };
    if (accessStatus === 'granted' && (before === 'requestable' || before === 'pending')) {
      void reloadRef.current();
    }
  }, [vaultId, accessStatus, accessVaultId]);
}
