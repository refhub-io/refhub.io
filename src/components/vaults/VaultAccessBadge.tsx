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
        <Badge className="gap-1 font-mono text-xs border-yellow-500/50 bg-yellow-500/10 text-yellow-600">
          <Crown className="w-3 h-3" />
          owner
        </Badge>
      )}
      {permission === 'editor' && (
        <Badge className="gap-1 font-mono text-xs border-green-500/50 bg-green-500/10 text-green-600">
          <Edit className="w-3 h-3" />
          editor
        </Badge>
      )}
      {permission === 'viewer' && (
        <Badge className="gap-1 font-mono text-xs border-blue-500/50 bg-blue-500/10 text-blue-500">
          <Eye className="w-3 h-3" />
          viewer
        </Badge>
      )}
    </div>
  );
};

export default VaultAccessBadge;