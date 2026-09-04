import React from 'react';
import { Eye, Edit, Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { VaultRole } from '@/types/vault-extensions';

interface VaultAccessBadgeProps {
  /**
   * The viewer's already-resolved permission for this vault (useVaultAccess's
   * `permission` field, NOT its `userRole` field — the latter is left `null`
   * for an anonymous visitor even when `permission` is 'viewer'). This is
   * purely presentational — it used to run its own useVaultAccess fetch, a
   * second independent access check racing the page's own. Its catch-all
   * mapped any transient query failure to "no_access" with no way to tell
   * that apart from an actual denial, and its own denied/pending/requestable
   * states could never legitimately occur wherever this badge was used
   * (protected/private vaults redirect away before this ever renders) — so
   * it had no real access decision to make. The caller already knows the
   * permission; pass it straight through instead of re-deriving it.
   */
  permission: VaultRole | null;
}

const VaultAccessBadge: React.FC<VaultAccessBadgeProps> = ({ permission }) => {
  if (permission === 'owner') {
    return (
      <Badge variant="outline" className="gap-1 font-mono text-xs">
        <Crown className="w-3 h-3" />
        owner
      </Badge>
    );
  }
  if (permission === 'editor') {
    return (
      <Badge variant="outline" className="gap-1 font-mono text-xs">
        <Edit className="w-3 h-3" />
        editor
      </Badge>
    );
  }
  if (permission === 'viewer') {
    return (
      <Badge variant="outline" className="gap-1 font-mono text-xs">
        <Eye className="w-3 h-3" />
        viewer
      </Badge>
    );
  }
  return null;
};

export default VaultAccessBadge;
