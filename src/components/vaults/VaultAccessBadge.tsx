import React from 'react';
import { Shield, Eye, Edit, Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useVaultAccess } from '@/hooks/useVaultAccess';

interface VaultAccessBadgeProps {
  vaultId: string;
}

const VaultAccessBadge: React.FC<VaultAccessBadgeProps> = ({ vaultId }) => {
  const { canEdit, permission, accessStatus } = useVaultAccess(vaultId);

  if (accessStatus === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <div className="animate-pulse">Checking access...</div>
      </div>
    );
  }

  if (accessStatus === 'denied' || accessStatus === 'pending') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-red-600">
        <Shield className="w-4 h-4" />
        <span>No Access</span>
      </div>
    );
  }

  if (accessStatus === 'requestable') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-yellow-600">
        <Eye className="w-4 h-4" />
        <span>Request Access</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {permission === 'owner' && (
        <Badge variant="outline" className="gap-1 font-mono text-xs">
          <Crown className="w-3 h-3" />
          owner
        </Badge>
      )}
      {permission === 'editor' && (
        <Badge variant="outline" className="gap-1 font-mono text-xs">
          <Edit className="w-3 h-3" />
          editor
        </Badge>
      )}
      {permission === 'viewer' && (
        <Badge variant="outline" className="gap-1 font-mono text-xs">
          <Eye className="w-3 h-3" />
          viewer
        </Badge>
      )}
    </div>
  );
};

export default VaultAccessBadge;