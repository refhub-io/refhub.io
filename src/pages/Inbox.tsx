import { useCallback, useEffect, useState } from 'react';
import { useInbox } from '@/hooks/useInbox';
import { useAllPublications } from '@/hooks/useAllPublications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { findDuplicateForItem } from '@/lib/inboxDedup';
import { suggestVaultForItem, suggestTagsForItem } from '@/lib/inboxSuggestions';
import { InboxCaptureForm } from '@/components/inbox/InboxCaptureForm';
import { InboxQueue } from '@/components/inbox/InboxQueue';
import { showError } from '@/lib/toast';

export function Inbox() {
  const { user } = useAuth();
  const { items, acceptItem, rejectItem, mergeItem, postponeItem, updateItemHints, refresh } = useInbox();
  const { publications, vaults, tags, publicationVaultsMap, publicationTagsMap, refetch } = useAllPublications();
  const [duplicateTitles, setDuplicateTitles] = useState<Record<string, string>>({});

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
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
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
  );
}
