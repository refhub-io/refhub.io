import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInbox } from '@/hooks/useInbox';
import { useAllPublications } from '@/hooks/useAllPublications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useVaults, useInvalidateVaults } from '@/hooks/useVaults';
import { findDuplicateForItem } from '@/lib/inboxDedup';
import { suggestVaultForItem, suggestTagsForItem } from '@/lib/inboxSuggestions';
import { InboxCaptureForm } from '@/components/inbox/InboxCaptureForm';
import { InboxQueue } from '@/components/inbox/InboxQueue';
import { showError } from '@/lib/toast';
import { SidebarDndBoundary } from '@/components/layout/SidebarDndBoundary';
import { MobileMenuButton } from '@/components/layout/MobileMenuButton';
import { ProfileDialog } from '@/components/profile/ProfileDialog';
import { VaultDialog } from '@/components/vaults/VaultDialog';
import { Inbox as InboxIcon } from 'lucide-react';
import type { Vault } from '@/types/database';

export function Inbox() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const { ownedVaults, sharedVaults } = useVaults();
  const invalidateVaults = useInvalidateVaults();
  const { items, acceptItem, rejectItem, mergeItem, postponeItem, updateItemHints, refresh } = useInbox();
  const { publications, vaults, tags, publicationVaultsMap, publicationTagsMap, refetch } = useAllPublications();
  const [duplicateTitles, setDuplicateTitles] = useState<Record<string, string>>({});
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [editingVault, setEditingVault] = useState<Vault | null>(null);

  const handleSaveVault = async (data: Partial<Vault>) => {
    if (!editingVault) return;
    const { data: updated, error } = await supabase
      .from('vaults')
      .update(data)
      .eq('id', editingVault.id)
      .select()
      .single();
    if (error) throw error;
    void invalidateVaults();
    return updated as Vault;
  };

  // Score each not-yet-scored item once the library data is available.
  useEffect(() => {
    items.forEach((item) => {
      if (item.suggested_vault_id !== null || item.duplicate_of_publication_id !== null) return;
      const duplicate = findDuplicateForItem(item.parsed_fields, publications);
      const suggestedVaultId = suggestVaultForItem(item.parsed_fields, publications, vaults, publicationVaultsMap);
      const suggestedTagIds = suggestTagsForItem(item.parsed_fields, suggestedVaultId, publications, publicationVaultsMap, publicationTagsMap);
      if (duplicate) setDuplicateTitles((prev) => ({ ...prev, [item.id]: duplicate.title }));
      updateItemHints(item.id, {
        duplicate_of_publication_id: duplicate?.id ?? null,
        suggested_vault_id: suggestedVaultId,
        suggested_tag_ids: suggestedTagIds,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, publications, vaults, publicationVaultsMap, publicationTagsMap]);

  // useCallback here matters beyond the usual perf reasoning: InboxQueue
  // registers these as keyboard-shortcut handlers ('a'/'x'/'m'/'s') via
  // useHotkeys, whose dependency array doesn't include these callback props.
  // A new inline function on every render would get captured once and then
  // go stale, so the accept/reject/merge/postpone hotkeys must receive
  // referentially-stable callbacks.
  const handleAccept = useCallback(async (id: string, vaultId: string, tagIds: string[]) => {
    const item = items.find((i) => i.id === id);
    if (!item || !user) return;
    const { data: newPub, error } = await supabase
      .from('publications')
      .insert([{ ...item.parsed_fields, user_id: user.id, authors: item.parsed_fields.authors || [] }])
      .select()
      .single();
    if (error || !newPub) return;

    const { data: newVaultPubId, error: copyError } = await supabase.rpc('copy_publication_to_vault', {
      pub_id: newPub.id,
      target_vault_id: vaultId,
      user_id: user.id,
    });
    if (copyError || !newVaultPubId) {
      showError('Could not file paper into vault', copyError?.message || 'Unknown error');
      return;
    }

    if (tagIds.length > 0) {
      const { error: tagError } = await supabase.from('publication_tags').insert(
        tagIds.map((tagId) => ({ publication_id: null, vault_publication_id: newVaultPubId, tag_id: tagId })),
      );
      if (tagError) {
        showError('Paper filed, but tags could not be saved', tagError.message);
        // Don't return here — the paper WAS successfully filed; only the tags failed.
        // Fall through to acceptItem so the inbox item is still correctly marked accepted.
      }
    }

    await acceptItem(id, vaultId, tagIds, newPub.id);
    refetch();
  }, [items, user, acceptItem, refetch]);

  const handleReject = useCallback((id: string) => { rejectItem(id); }, [rejectItem]);
  const handleMerge = useCallback((id: string) => { mergeItem(id); }, [mergeItem]);
  const handlePostpone = useCallback((id: string) => { postponeItem(id); }, [postponeItem]);
  const handleCreated = useCallback(() => { refresh(); }, [refresh]);

  return (
    <div className="flex min-h-screen bg-background">
      <SidebarDndBoundary
        vaults={ownedVaults}
        sharedVaults={sharedVaults}
        selectedVaultId={null}
        onSelectVault={(vaultId) => (vaultId ? navigate(`/vault/${vaultId}`) : navigate('/dashboard'))}
        onCreateVault={() => navigate('/dashboard?createVault=1')}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
        profile={profile}
        onEditProfile={() => setIsProfileDialogOpen(true)}
        onEditVault={(vault) => {
          setEditingVault(vault);
          setIsVaultDialogOpen(true);
        }}
      />
      <main className="flex-1 lg:pl-72 min-w-0 flex flex-col min-h-screen">
        <div className="flex items-center gap-1 px-4 lg:px-8 py-2 border-b border-border shrink-0">
          <MobileMenuButton onClick={() => setIsMobileSidebarOpen(true)} />
          <div className="w-6 h-6 rounded-md flex items-center justify-center bg-gradient-to-br from-[hsl(var(--cyber-blue))]/20 to-[hsl(var(--neon-green))]/20 shrink-0">
            <InboxIcon className="w-3.5 h-3.5 text-primary" />
          </div>
          <h1 className="text-sm font-mono font-semibold">inbox</h1>
        </div>

        <div className="max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
          <InboxCaptureForm onCreated={handleCreated} />
          <InboxQueue
            items={items}
            duplicateTitles={duplicateTitles}
            vaults={vaults}
            tags={tags}
            onAccept={handleAccept}
            onReject={handleReject}
            onMerge={handleMerge}
            onPostpone={handlePostpone}
          />
        </div>
      </main>

      <ProfileDialog
        open={isProfileDialogOpen}
        onOpenChange={(open) => {
          setIsProfileDialogOpen(open);
          if (!open) {
            void refetchProfile();
          }
        }}
      />

      <VaultDialog
        open={isVaultDialogOpen}
        onOpenChange={setIsVaultDialogOpen}
        vault={editingVault}
        onSave={handleSaveVault}
        onUpdate={() => {}}
      />
    </div>
  );
}
