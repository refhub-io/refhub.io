import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllPageCaches, getPageCache, setPageCache } from './pageCache';
import { ownerTag } from './cacheOwner';

// How the vault access and vault content caches are scoped: entries carry ownerTag(user).
describe('page cache entries saved for a user', () => {
  beforeEach(() => clearAllPageCaches());

  it('are returned to that user only', () => {
    setPageCache('vault-content-v1', { papers: 2 }, ownerTag('user-a'));
    expect(getPageCache('vault-content-v1', ownerTag('user-a'))).toEqual({ papers: 2 });
    expect(getPageCache('vault-content-v1', ownerTag('user-b'))).toBeNull();
  });

  it('are never returned to a signed-out reader', () => {
    setPageCache('vault-content-v1', { papers: 2 }, ownerTag('user-a'));
    expect(getPageCache('vault-content-v1', ownerTag(null))).toBeNull();
  });

  it('are kept apart from what was saved while signed out', () => {
    setPageCache('vault-access-v1', { canView: true }, ownerTag(null));
    expect(getPageCache('vault-access-v1', ownerTag('user-a'))).toBeNull();
  });
});
