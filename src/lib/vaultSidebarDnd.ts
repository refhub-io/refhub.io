import { Vault } from '@/types/database';
import { VaultRole } from '@/types/vault-extensions';

// Sorts vaults according to a stored id order (from useVaultSidebarOrder),
// appending anything not present in that order — new vaults, or ids for
// vaults that no longer exist — at the end in their original order.
export function applyVaultOrder(vaults: Vault[], orderedIds: string[]): Vault[] {
  if (orderedIds.length === 0) return vaults;

  const byId = new Map(vaults.map((vault) => [vault.id, vault]));
  const seen = new Set<string>();
  const ordered: Vault[] = [];

  for (const id of orderedIds) {
    const vault = byId.get(id);
    if (vault && !seen.has(id)) {
      ordered.push(vault);
      seen.add(id);
    }
  }

  for (const vault of vaults) {
    if (!seen.has(vault.id)) {
      ordered.push(vault);
      seen.add(vault.id);
    }
  }

  return ordered;
}

export function isEditableRole(role: VaultRole | null | undefined): boolean {
  return role === 'owner' || role === 'editor';
}

// Vault ids a paper can be dropped onto: all owned vaults, plus shared
// vaults where the current user's role grants edit access.
export function getDroppableVaultIds(
  ownedVaultIds: string[],
  sharedVaultRoles: Record<string, VaultRole>,
): Set<string> {
  const editableShared = Object.entries(sharedVaultRoles)
    .filter(([, role]) => isEditableRole(role))
    .map(([id]) => id);

  return new Set([...ownedVaultIds, ...editableShared]);
}

export type VaultDragItemType = 'publication' | 'vault';

interface VaultDragEndInfo {
  active: {
    id: string;
    data: { type?: VaultDragItemType; publicationIds?: string[] };
  };
  over: {
    id: string;
    data: { type?: VaultDragItemType };
  } | null;
}

export type VaultDragEndAction =
  | { type: 'reorder-vaults'; activeVaultId: string; overVaultId: string }
  | { type: 'add-to-vault'; publicationIds: string[]; vaultId: string }
  | { type: 'noop' };

// Single dispatch point for the sidebar's DndContext: decides whether a drop
// means "add these papers to this vault" or "move this vault to this spot",
// based on what was dragged (active) and what it landed on (over).
export function resolveVaultDragEndAction({ active, over }: VaultDragEndInfo): VaultDragEndAction {
  if (!over) return { type: 'noop' };

  if (active.data.type === 'publication' && over.data.type === 'vault') {
    const publicationIds = active.data.publicationIds ?? [];
    if (publicationIds.length === 0) return { type: 'noop' };
    return { type: 'add-to-vault', publicationIds, vaultId: over.id };
  }

  if (active.data.type === 'vault' && over.data.type === 'vault' && active.id !== over.id) {
    return { type: 'reorder-vaults', activeVaultId: active.id, overVaultId: over.id };
  }

  return { type: 'noop' };
}
