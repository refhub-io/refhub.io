import React from 'react';
import { Shield, Eye, Edit, Crown } from 'lucide-react';
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
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      {permission === 'owner' && (
        <>
          <Crown className="w-4 h-4 text-yellow-500" />
          <span className="text-yellow-600">Owner</span>
        </>
      )}
      {permission === 'editor' && (
        <>
          <Edit className="w-4 h-4 text-blue-500" />
          <span className="text-blue-600">Editor</span>
        </>
      )}
      {permission === 'viewer' && (
        <>
          <Eye className="w-4 h-4 text-green-500" />
          <span className="text-green-600">Viewer</span>
        </>
      )}
    </div>
  );
};

export default VaultAccessBadge;