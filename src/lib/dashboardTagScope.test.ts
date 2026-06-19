import { describe, expect, it } from 'vitest';
import { filterDashboardTags, getDashboardAccessibleVaultIds } from './dashboardTagScope';
import { Tag } from '@/types/database';

describe('dashboardTagScope', () => {
  it('keeps personal tags plus tags from owned and explicitly shared vaults', () => {
    const tags: Tag[] = [
      {
        id: 'personal-tag',
        user_id: 'user-1',
        name: 'personal',
        color: '#111111',
        parent_id: null,
        depth: 0,
        created_at: '2026-05-28T00:00:00Z',
        vault_id: null,
      },
      {
        id: 'owned-vault-tag',
        user_id: 'user-2',
        name: 'owned vault',
        color: '#222222',
        parent_id: null,
        depth: 0,
        created_at: '2026-05-28T00:00:00Z',
        vault_id: 'vault-owned',
      },
      {
        id: 'shared-vault-tag',
        user_id: 'user-3',
        name: 'shared vault',
        color: '#333333',
        parent_id: null,
        depth: 0,
        created_at: '2026-05-28T00:00:00Z',
        vault_id: 'vault-shared',
      },
      {
        id: 'public-leak-tag',
        user_id: 'user-4',
        name: 'public leak',
        color: '#444444',
        parent_id: null,
        depth: 0,
        created_at: '2026-05-28T00:00:00Z',
        vault_id: 'vault-unrelated-public',
      },
      {
        id: 'other-users-personal-tag',
        user_id: 'user-5',
        name: 'other personal',
        color: '#555555',
        parent_id: null,
        depth: 0,
        created_at: '2026-05-28T00:00:00Z',
        vault_id: null,
      },
    ];

    expect(
      getDashboardAccessibleVaultIds({
        ownedVaults: [{ id: 'vault-owned' }],
        sharedVaultIds: ['vault-shared', 'vault-shared'],
      }),
    ).toEqual(['vault-owned', 'vault-shared']);

    expect(
      filterDashboardTags(tags, {
        userId: 'user-1',
        ownedVaults: [{ id: 'vault-owned' }],
        sharedVaultIds: ['vault-shared'],
      }).map((tag) => tag.id),
    ).toEqual(['personal-tag', 'owned-vault-tag', 'shared-vault-tag']);
  });
});
