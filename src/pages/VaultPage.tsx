import React from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { useVaultAccess } from '../hooks/useVaultAccess';

// Import existing components for now
import PublicVault from './PublicVault';
import SharedVault from './SharedVault';
import VaultAccessBadge from '../components/vaults/VaultAccessBadge';

// Access request dialog component
const AccessRequestDialog: React.FC<{
  vaultId: string;
  onRequestAccess: (note?: string) => Promise<void>;
  onClose: () => void;
}> = ({ vaultId, onRequestAccess, onClose }) => {
  const [note, setNote] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onRequestAccess(note);
      onClose();
    } catch (error) {
      console.error('Error requesting access:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-semibold mb-4">Request Access to Vault</h2>
        <p className="text-gray-600 mb-4">
          This vault is protected. Please request access from the vault owner.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="Let the vault owner know why you'd like access..."
            />
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Requesting...' : 'Request Access'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Access denied component
const AccessDenied: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-semibold mb-4 text-red-600">Access Denied</h2>
        <p className="text-gray-600 mb-4">
          This is a private vault. You need to be invited by the vault owner to access it.
        </p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Loading component
const VaultLoading: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Checking vault access...</p>
      </div>
    </div>
  );
};

// Error component
const VaultError: React.FC<{ error: string | null; onRetry: () => void }> = ({ error, onRetry }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center max-w-md mx-4">
        <div className="text-red-600 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Vault Access Error</h2>
        <p className="text-gray-600 mb-4">{error || 'An unknown error occurred'}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    </div>
  );
};

const VaultPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { 
    canView, 
    canEdit, 
    isOwner, 
    permission, 
    accessStatus, 
    vault, 
    error,
    refresh 
  } = useVaultAccess(slug || '');

  const [showRequestDialog, setShowRequestDialog] = React.useState(false);

  const handleRequestAccess = async (note?: string) => {
    if (!vault?.id) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Redirect to auth
      window.location.href = '/auth';
      return;
    }

    const { requestVaultAccess } = await import('../hooks/useVaultAccess');
    const result = await requestVaultAccess(vault.id, user.id, note);
    
    if (result.error) {
      throw result.error;
    }
    
    // Refresh the access status
    refresh();
  };

  const handleCloseDialog = () => {
    setShowRequestDialog(false);
  };

  const handleRetry = () => {
    refresh();
  };

  // Loading state
  if (accessStatus === 'loading') {
    return <VaultLoading />;
  }

  // Error state
  if (error && !vault) {
    return <VaultError error={error} onRetry={handleRetry} />;
  }

  // Access denied for private vaults
  if (accessStatus === 'denied') {
    return <AccessDenied onClose={handleCloseDialog} />;
  }

  // Show request dialog for protected vaults
  if (accessStatus === 'requestable') {
    return (
      <>
        <VaultError 
          error="This vault requires access approval" 
          onRetry={() => setShowRequestDialog(true)}
        />
        {showRequestDialog && (
          <AccessRequestDialog
            vaultId={vault?.id || ''}
            onRequestAccess={handleRequestAccess}
            onClose={handleCloseDialog}
          />
        )}
      </>
    );
  }

  // Pending access request
  if (accessStatus === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-yellow-600 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Access Request Pending</h2>
          <p className="text-gray-600">
            Your request to access this vault is pending approval from the vault owner.
          </p>
        </div>
      </div>
    );
  }

  // If we have access, render the appropriate vault component
  if (canView && vault) {
    const vaultId = (vault as any).id;
    
    return (
      <div className="min-h-screen bg-background">
        {/* Vault header with access badge */}
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-bold">{vault.name}</h1>
                <VaultAccessBadge vaultId={vaultId} />
              </div>
            </div>
          </div>
        </div>
        
        {/* Vault content */}
        {(() => {
          // For now, delegate to existing components based on visibility
          // In the future, these would be unified into a single component
          const vaultWithVisibility = vault as any;
          if (vaultWithVisibility.visibility === 'public') {
            return <PublicVault />;
          } else {
            return <SharedVault />;
          }
        })()}
      </div>
    );
  }

  // Fallback
  return <VaultError error="Unable to access vault" onRetry={handleRetry} />;
};

export default VaultPage;