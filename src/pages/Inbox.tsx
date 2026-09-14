import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { LoadingSpinner } from '@/components/ui/loading';
import { Inbox as InboxIcon, AlertCircle, Compass } from 'lucide-react';
import type { Vault } from '@/types/database';

export function Inbox() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const { ownedVaults, sharedVaults, sharedVaultRoles } = useVaults();
  const invalidateVaults = useInvalidateVaults();
  const { items, acceptItem, rejectItem, mergeItem, postponeItem, updateItemHints, refresh } = useInbox();
  const { publications, tags, publicationVaultsMap, publicationTagsMap, refetch } = useAllPublications();
  const [duplicateTitles, setDuplicateTitles] = useState<Record<string, string>>({});
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [editingVault, setEditingVault] = useState<Vault | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/');
  }, [user, authLoading, navigate]);

  // Filing a paper requires write access -- a viewer-only shared vault would
  // let the RPC fail after the canonical publication has already been
  // inserted, leaving an orphaned publication with the inbox item still
  // pending. Also used for the suggestion effect below, so a suggestion
  // never points at a vault the user couldn't actually file into.
  const fileableVaults = useMemo(
    () => [...ownedVaults, ...sharedVaults.filter((v) => sharedVaultRoles[v.id] !== 'viewer')],
    [ownedVaults, sharedVaults, sharedVaultRoles],
  );

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
  //
  // "Already scored" can't be read back from suggested_vault_id/
  // duplicate_of_publication_id being non-null -- a legitimate "no match
  // found" result leaves both null, indistinguishable from "never scored".
  // Without a separate marker, updateItemHints's own write changes `items`'
  // reference, which re-triggers this effect, which finds the same
  // apparently-unscored item and writes the same null hints again --
  // an infinite loop (and, in the browser, a pegged render loop that made
  // every button/keybind on the page appear completely unresponsive).
  const scoredItemIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    items.forEach((item) => {
      if (scoredItemIdsRef.current.has(item.id)) return;
      if (item.suggested_vault_id !== null || item.duplicate_of_publication_id !== null) {
        scoredItemIdsRef.current.add(item.id);
        // A duplicate found in an earlier session persists on the item
        // (duplicate_of_publication_id), but duplicateTitles is local-only
        // state that starts empty on every fresh mount -- without
        // repopulating it here too, the duplicate banner and "m" merge
        // action silently become unavailable for this item after a reload.
        if (item.duplicate_of_publication_id) {
          const existing = publications.find((p) => p.id === item.duplicate_of_publication_id);
          if (existing) setDuplicateTitles((prev) => ({ ...prev, [item.id]: existing.title }));
        }
        return;
      }
      scoredItemIdsRef.current.add(item.id);
      const duplicate = findDuplicateForItem(item.parsed_fields, publications);
      const suggestedVaultId = suggestVaultForItem(item.parsed_fields, publications, fileableVaults, publicationVaultsMap);
      const suggestedTagIds = suggestTagsForItem(item.parsed_fields, suggestedVaultId, publications, publicationVaultsMap, publicationTagsMap);
      if (duplicate) setDuplicateTitles((prev) => ({ ...prev, [item.id]: duplicate.title }));
      updateItemHints(item.id, {
        duplicate_of_publication_id: duplicate?.id ?? null,
        suggested_vault_id: suggestedVaultId,
        suggested_tag_ids: suggestedTagIds,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, publications, fileableVaults, publicationVaultsMap, publicationTagsMap]);

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
    if (error || !newPub) {
      showError('Could not add paper to your library', error?.message || 'Unknown error');
      return;
    }

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
      // `tags` aggregates every tag the user can see across all accessible
      // vaults, so a stale/leftover selection could otherwise attach a tag
      // from a different vault (or a global one) to this vault's copy --
      // validate against the target vault first, same as
      // useSharedVaultOperations.ts's own tag-attach path.
      const { data: validTags, error: tagValidationError } = await supabase
        .from('tags')
        .select('id')
        .in('id', tagIds)
        .eq('vault_id', vaultId);
      const validTagIds = tagValidationError ? [] : (validTags ?? []).map((t) => t.id);

      if (validTagIds.length > 0) {
        const { error: tagError } = await supabase.from('publication_tags').insert(
          validTagIds.map((tagId) => ({ publication_id: null, vault_publication_id: newVaultPubId, tag_id: tagId })),
        );
        if (tagError) {
          showError('Paper filed, but tags could not be saved', tagError.message);
          // Don't return here — the paper WAS successfully filed; only the tags failed.
          // Fall through to acceptItem so the inbox item is still correctly marked accepted.
        }
      }
    }

    await acceptItem(id, vaultId, tagIds, newPub.id);
    refetch();
  }, [items, user, acceptItem, refetch]);

  const handleReject = useCallback((id: string) => { rejectItem(id); }, [rejectItem]);
  const handleMerge = useCallback((id: string) => { mergeItem(id); }, [mergeItem]);
  const handlePostpone = useCallback((id: string) => { postponeItem(id); }, [postponeItem]);
  const handleCreated = useCallback(() => { refresh(); }, [refresh]);

  // duplicateTitles is never pruned as items leave the queue (accept/reject/
  // merge/postpone all just filter `items`), so counting its keys directly
  // would keep inflating this stat for the rest of the page session --
  // count only entries whose item is still actually pending.
  const duplicateCount = items.filter((item) => duplicateTitles[item.id]).length;
  const readyToFileCount = items.filter((item) => item.suggested_vault_id !== null).length;

  if (authLoading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    return null;
  }

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
        {!isMobileSidebarOpen && (
          <MobileMenuButton onClick={() => setIsMobileSidebarOpen(true)} className="fixed top-4 left-4 z-50" />
        )}

        {/* Overview header -- explains what the inbox is for (not obvious to
            everyone) and surfaces at-a-glance stats on what needs triage,
            same spirit as TheCodex's hero but scaled down for a utility page. */}
        <div className="w-full border-b-2 border-border bg-gradient-to-b from-sky-500/5 via-cyan-500/5 to-background">
          <div className="px-4 lg:px-8 py-10 sm:py-14 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-sky-500/10 to-cyan-500/10 border border-sky-500/20 mb-4">
              <InboxIcon className="w-3.5 h-3.5 text-sky-500" />
              <span className="text-xs font-medium text-sky-500 font-mono">staging_area</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3 font-mono">
              <span className="bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent">inbox</span>
            </h1>
            <p className="text-muted-foreground font-mono text-sm sm:text-base max-w-2xl mx-auto mb-6">
              // capture a paper before you know where it belongs, then triage it here — pick a vault, add tags, and file it (or reject/merge if it turns out to be a duplicate).
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm font-mono">
              <span className="inline-flex items-center gap-1.5">
                <InboxIcon className="w-3.5 h-3.5 text-sky-500" />
                <strong>{items.length}</strong> pending
              </span>
              <span className="inline-flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                <AlertCircle className="w-3.5 h-3.5" />
                <strong>{duplicateCount}</strong> possible duplicate{duplicateCount === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-neon-green">
                <Compass className="w-3.5 h-3.5" />
                <strong>{readyToFileCount}</strong> ready to file
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
          <InboxCaptureForm onCreated={handleCreated} />
          <InboxQueue
            items={items}
            duplicateTitles={duplicateTitles}
            vaults={fileableVaults}
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
