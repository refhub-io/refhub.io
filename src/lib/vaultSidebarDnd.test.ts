import { describe, expect, it } from 'vitest';
import { Vault } from '@/types/database';
import { applyVaultOrder, getDroppableVaultIds, isEditableRole, resolveVaultDragEndAction } from './vaultSidebarDnd';

function makeVault(id: string, name: string): Vault {
  return {
    id,
    user_id: 'user-1',
    name,
    description: null,
    color: '#6366f1',
    visibility: 'private',
    public_slug: null,
    category: null,
    abstract: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('applyVaultOrder', () => {
  const vaults = [makeVault('a', 'Alpha'), makeVault('b', 'Beta'), makeVault('c', 'Gamma')];

  it('returns vaults unchanged when no stored order exists', () => {
    expect(applyVaultOrder(vaults, [])).toEqual(vaults);
  });

  it('sorts vaults according to the stored id order', () => {
    const ordered = applyVaultOrder(vaults, ['c', 'a', 'b']);
    expect(ordered.map(v => v.id)).toEqual(['c', 'a', 'b']);
  });

  it('appends vaults missing from the stored order at the end, in their original order', () => {
    const ordered = applyVaultOrder(vaults, ['b']);
    expect(ordered.map(v => v.id)).toEqual(['b', 'a', 'c']);
  });

  it('ignores stale ids in the stored order that no longer correspond to a vault', () => {
    const ordered = applyVaultOrder(vaults, ['deleted-vault', 'c', 'a']);
    expect(ordered.map(v => v.id)).toEqual(['c', 'a', 'b']);
  });

  it('ignores duplicate ids in the stored order', () => {
    const ordered = applyVaultOrder(vaults, ['a', 'a', 'b']);
    expect(ordered.map(v => v.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('isEditableRole', () => {
  it('treats owner and editor as editable', () => {
    expect(isEditableRole('owner')).toBe(true);
    expect(isEditableRole('editor')).toBe(true);
  });

  it('treats viewer and missing roles as not editable', () => {
    expect(isEditableRole('viewer')).toBe(false);
    expect(isEditableRole(null)).toBe(false);
    expect(isEditableRole(undefined)).toBe(false);
  });
});

describe('getDroppableVaultIds', () => {
  it('always includes owned vaults', () => {
    const ids = getDroppableVaultIds(['owned-1', 'owned-2'], {});
    expect(ids.has('owned-1')).toBe(true);
    expect(ids.has('owned-2')).toBe(true);
  });

  it('includes shared vaults where the role is editor or owner', () => {
    const ids = getDroppableVaultIds([], {
      'shared-editor': 'editor',
      'shared-owner': 'owner',
      'shared-viewer': 'viewer',
    });
    expect(ids.has('shared-editor')).toBe(true);
    expect(ids.has('shared-owner')).toBe(true);
    expect(ids.has('shared-viewer')).toBe(false);
  });
});

describe('resolveVaultDragEndAction', () => {
  it('does nothing when dropped outside any droppable', () => {
    const action = resolveVaultDragEndAction({
      active: { id: 'publication:pub-1', data: { type: 'publication', publicationIds: ['pub-1'] } },
      over: null,
    });
    expect(action).toEqual({ type: 'noop' });
  });

  it('adds a dragged publication to the vault it was dropped on', () => {
    const action = resolveVaultDragEndAction({
      active: { id: 'publication:pub-1', data: { type: 'publication', publicationIds: ['pub-1'] } },
      over: { id: 'vault-1', data: { type: 'vault' } },
    });
    expect(action).toEqual({ type: 'add-to-vault', publicationIds: ['pub-1'], vaultId: 'vault-1' });
  });

  it('adds every selected publication when the dragged card is part of a multi-select', () => {
    const action = resolveVaultDragEndAction({
      active: { id: 'publication:pub-1', data: { type: 'publication', publicationIds: ['pub-1', 'pub-2', 'pub-3'] } },
      over: { id: 'vault-1', data: { type: 'vault' } },
    });
    expect(action).toEqual({ type: 'add-to-vault', publicationIds: ['pub-1', 'pub-2', 'pub-3'], vaultId: 'vault-1' });
  });

  it('does nothing when a publication is dropped without any ids attached', () => {
    const action = resolveVaultDragEndAction({
      active: { id: 'publication:pub-1', data: { type: 'publication', publicationIds: [] } },
      over: { id: 'vault-1', data: { type: 'vault' } },
    });
    expect(action).toEqual({ type: 'noop' });
  });

  it('reorders vaults when a vault is dropped on another vault', () => {
    const action = resolveVaultDragEndAction({
      active: { id: 'vault-1', data: { type: 'vault' } },
      over: { id: 'vault-2', data: { type: 'vault' } },
    });
    expect(action).toEqual({ type: 'reorder-vaults', activeVaultId: 'vault-1', overVaultId: 'vault-2' });
  });

  it('does nothing when a vault is dropped on itself', () => {
    const action = resolveVaultDragEndAction({
      active: { id: 'vault-1', data: { type: 'vault' } },
      over: { id: 'vault-1', data: { type: 'vault' } },
    });
    expect(action).toEqual({ type: 'noop' });
  });

  it('does nothing when a vault is dropped on a publication (not a valid target)', () => {
    const action = resolveVaultDragEndAction({
      active: { id: 'vault-1', data: { type: 'vault' } },
      over: { id: 'publication:pub-1', data: { type: 'publication' } },
    });
    expect(action).toEqual({ type: 'noop' });
  });
});
