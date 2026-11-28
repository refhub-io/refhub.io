import { describe, expect, it } from 'vitest';
import type { Publication, Vault } from '@/types/database';
import { findSharedPublications } from './sharedPublications';

const me = 'user-me';
const paper = (id: string, userId: string) => ({ id, user_id: userId }) as Publication;
const vault = (id: string, userId: string, name: string) => ({ id, user_id: userId, name }) as Vault;
const vaults = [
  vault('mine', me, 'my vault'),
  vault('theirs', 'user-them', 'their vault'),
  vault('theirs-too', 'user-them', 'another of theirs'),
];

describe('findSharedPublications', () => {
  it('marks a paper someone else added, held only in vaults shared with me', () => {
    const shared = findSharedPublications([paper('vp1', 'user-them')], { vp1: ['theirs', 'theirs-too'] }, {
      userId: me, vaults, sharedVaultRoles: { theirs: 'viewer', 'theirs-too': 'viewer' },
    });
    expect(shared).toEqual({ vp1: { vaultNames: ['their vault', 'another of theirs'], canEdit: false } });
  });

  it('lets me edit it when one of those vaults made me an editor', () => {
    const shared = findSharedPublications([paper('vp1', 'user-them')], { vp1: ['theirs', 'theirs-too'] }, {
      userId: me, vaults, sharedVaultRoles: { theirs: 'viewer', 'theirs-too': 'editor' },
    });
    expect(shared.vp1.canEdit).toBe(true);
  });

  it("leaves my own papers alone, even in a vault shared with me", () => {
    expect(findSharedPublications([paper('p1', me)], { p1: ['theirs'] }, { userId: me, vaults })).toEqual({});
  });

  it('leaves a paper a collaborator added to one of my vaults alone', () => {
    expect(findSharedPublications([paper('vp1', 'user-them')], { vp1: ['mine', 'theirs'] }, { userId: me, vaults })).toEqual({});
  });

  it('marks nothing without a signed-in user', () => {
    expect(findSharedPublications([paper('vp1', 'user-them')], { vp1: ['theirs'] }, { userId: undefined, vaults })).toEqual({});
  });
});
