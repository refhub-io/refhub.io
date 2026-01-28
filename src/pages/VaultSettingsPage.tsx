import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { useVaultAccess } from '../hooks/useVaultAccess';
import { getVaultShares, updateVaultShareRole, removeVaultShare, shareVault } from '../hooks/useVaultAccess';
import { VaultVisibility, VaultRole } from '../types/vault-extensions';

const VaultSettingsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canEdit, vault } = useVaultAccess(id || '');
  
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form state for adding new shares
  const [newShareEmail, setNewShareEmail] = useState('');
  const [newShareRole, setNewShareRole] = useState<'viewer' | 'editor'>('viewer');
  const [isAddingShare, setIsAddingShare] = useState(false);

  // Visibility update state
  const [visibility, setVisibility] = useState<VaultVisibility>('private');
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);

  useEffect(() => {
    if (vault?.id) {
      const vaultWithVisibility = vault as any;
      setVisibility(vaultWithVisibility.visibility || 'private');
      loadShares();
    }
  }, [vault]);

  const loadShares = async () => {
    if (!vault?.id) return;
    
    try {
      const { data, error } = await getVaultShares(vault.id);
      if (error) throw error;
      setShares(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shares');
    } finally {
      setLoading(false);
    }
  };

  const handleAddShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vault?.id || !newShareEmail) return;

    setIsAddingShare(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // First, try to find user by email
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', newShareEmail.toLowerCase())
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      const result = await shareVault(
        vault.id,
        user.id,
        profiles?.id || null,
        profiles ? null : newShareEmail,
        newShareRole
      );

      if (result.error) throw result.error;

      setNewShareEmail('');
      setNewShareRole('viewer');
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add share');
    } finally {
      setIsAddingShare(false);
    }
  };

  const handleUpdateRole = async (shareId: string, role: VaultRole) => {
    try {
      const { error } = await updateVaultShareRole(shareId, role as 'editor' | 'viewer');
      if (error) throw error;
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    try {
      const { error } = await removeVaultShare(shareId);
      if (error) throw error;
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove share');
    }
  };

  const handleVisibilityChange = async (newVisibility: VaultVisibility) => {
    if (!vault?.id) return;

    setIsUpdatingVisibility(true);
    try {
      const { error } = await supabase
        .from('vaults')
        .update({ visibility: newVisibility } as any)
        .eq('id', vault.id);

      if (error) throw error;
      setVisibility(newVisibility);
      
      // Refresh vault access to update UI
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update visibility');
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">You don't have permission to edit this vault's settings.</p>
          <button
            onClick={() => navigate(`/vault/${id}`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Vault
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading vault settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => navigate(`/vault/${id}`)}
            className="text-blue-600 hover:text-blue-800 mb-4"
          >
            ← Back to Vault
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Vault Settings</h1>
          <p className="text-gray-600 mt-2">{vault?.name}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Visibility Settings */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Vault Visibility</h2>
          <div className="space-y-3">
            <label className="flex items-center">
              <input
                type="radio"
                value="private"
                checked={visibility === 'private'}
                onChange={(e) => handleVisibilityChange(e.target.value as VaultVisibility)}
                disabled={isUpdatingVisibility}
                className="mr-3"
              />
              <div>
                <span className="font-medium">Private</span>
                <p className="text-sm text-gray-600">Only you and people you invite can access this vault</p>
              </div>
            </label>
            
            <label className="flex items-center">
              <input
                type="radio"
                value="protected"
                checked={visibility === 'protected'}
                onChange={(e) => handleVisibilityChange(e.target.value as VaultVisibility)}
                disabled={isUpdatingVisibility}
                className="mr-3"
              />
              <div>
                <span className="font-medium">Protected</span>
                <p className="text-sm text-gray-600">Anyone can discover this vault, but access requires approval</p>
              </div>
            </label>
            
            <label className="flex items-center">
              <input
                type="radio"
                value="public"
                checked={visibility === 'public'}
                onChange={(e) => handleVisibilityChange(e.target.value as VaultVisibility)}
                disabled={isUpdatingVisibility}
                className="mr-3"
              />
              <div>
                <span className="font-medium">Public</span>
                <p className="text-sm text-gray-600">Anyone can view this vault</p>
              </div>
            </label>
          </div>
        </div>

        {/* Share Management */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Share Management</h2>
          
          {/* Add new share form */}
          <form onSubmit={handleAddShare} className="mb-6">
            <div className="flex gap-4">
              <input
                type="email"
                value={newShareEmail}
                onChange={(e) => setNewShareEmail(e.target.value)}
                placeholder="Enter email address"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <select
                value={newShareRole}
                onChange={(e) => setNewShareRole(e.target.value as 'viewer' | 'editor')}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button
                type="submit"
                disabled={isAddingShare}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isAddingShare ? 'Adding...' : 'Add Share'}
              </button>
            </div>
          </form>

          {/* Existing shares */}
          <div className="space-y-3">
            {shares.map((share) => (
              <div key={share.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-gray-300 rounded-full mr-3"></div>
                  <div>
                    <p className="font-medium">
                      {share.profiles?.display_name || share.shared_with_email || 'Unknown User'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {share.profiles?.email || share.shared_with_email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={share.role}
                    onChange={(e) => handleUpdateRole(share.id, e.target.value as VaultRole)}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button
                    onClick={() => handleRemoveShare(share.id)}
                    className="px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            
            {shares.length === 0 && (
              <p className="text-gray-500 text-center py-4">No shares yet. Add people to collaborate!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VaultSettingsPage;