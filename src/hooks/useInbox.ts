import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { InboxItem, InboxSourceType, Publication } from '@/types/database';

function sortInboxItems(a: InboxItem, b: InboxItem): number {
  return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
}

export interface CreateInboxItemInput {
  sourceType: InboxSourceType;
  sourceRef: string;
  parsedFields: Partial<Publication>;
}

export function inboxItemsQueryKey(userId: string | undefined) {
  return ['inbox-items', userId] as const;
}

async function fetchInboxItems(userId: string): Promise<InboxItem[]> {
  const { data, error } = await supabase
    .from('inbox_items')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as InboxItem[];
}

// react-query-backed for the same reason useVaults()/useVaultFavorites() are
// (#206): Sidebar.tsx renders a pending-count pill via its own useInbox()
// call, separate from the Inbox page's own call -- a plain useState/useEffect
// hook here meant accepting/rejecting an item on the page never reached the
// Sidebar's independent copy of the list, leaving its pill stale until the
// Sidebar happened to remount. A shared react-query cache means every
// mounted useInbox() call sees the same data, updated in one place.
export function useInbox() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: inboxItemsQueryKey(user?.id),
    queryFn: () => fetchInboxItems(user!.id),
    enabled: !!user,
  });

  const items = query.data ?? [];

  const setItems = useCallback((updater: (prev: InboxItem[]) => InboxItem[]) => {
    queryClient.setQueryData(inboxItemsQueryKey(user?.id), (prev: InboxItem[] | undefined) => updater(prev ?? []));
  }, [queryClient, user?.id]);

  // Mirrors useNotifications.ts's postgres_changes pattern: an inbox item
  // captured or filed from outside this browser tab -- the CLI, an agent
  // skill, or the /api/v1/inbox HTTP API -- has no local mutation call to
  // update this cache after, so without a live subscription the queue and
  // the Sidebar's pending-count pill both go stale until a manual refresh.
  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    const channel = supabase
      .channel(`inbox-items-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox_items', filter: `user_id=eq.${userId}` },
        (payload) => {
          const item = payload.new as InboxItem;
          if (item.status !== 'pending') return;
          setItems((prev) => {
            if (prev.some((i) => i.id === item.id)) return prev;
            return [...prev, item].sort(sortInboxItems);
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inbox_items', filter: `user_id=eq.${userId}` },
        (payload) => {
          const item = payload.new as InboxItem;
          setItems((prev) => {
            if (item.status !== 'pending') return prev.filter((i) => i.id !== item.id);
            const exists = prev.some((i) => i.id === item.id);
            const next = exists ? prev.map((i) => (i.id === item.id ? item : i)) : [...prev, item];
            return next.sort(sortInboxItems);
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'inbox_items', filter: `user_id=eq.${userId}` },
        (payload) => {
          const deletedId = (payload.old as Partial<InboxItem>).id;
          if (!deletedId) return;
          setItems((prev) => prev.filter((i) => i.id !== deletedId));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // Depend on user?.id, not user -- useAuth() returns a new object each
    // render, and depending on the whole object would tear down and
    // recreate the channel on every render instead of only on user change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, setItems]);

  const createItem = useCallback(async (input: CreateInboxItemInput): Promise<InboxItem | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('inbox_items')
      .insert([{
        user_id: user.id,
        status: 'pending',
        source_type: input.sourceType,
        source_ref: input.sourceRef,
        parsed_fields: input.parsedFields,
      }])
      .select()
      .single();
    if (error || !data) return null;
    const created = data as InboxItem;
    setItems((prev) => [...prev, created]);
    return created;
  }, [user, setItems]);

  const updateItemHints = useCallback(async (
    id: string,
    hints: Partial<Pick<InboxItem, 'duplicate_of_publication_id' | 'suggested_vault_id' | 'suggested_tag_ids'>>,
  ) => {
    const { error } = await supabase.from('inbox_items').update(hints).eq('id', id);
    if (error) return;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...hints } : item)));
  }, [setItems]);

  const acceptItem = useCallback(async (id: string, vaultId: string, tagIds: string[], filedPublicationId: string) => {
    const { error } = await supabase.from('inbox_items').update({
      status: 'accepted',
      suggested_vault_id: vaultId,
      suggested_tag_ids: tagIds,
      filed_publication_id: filedPublicationId,
    }).eq('id', id);
    if (error) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, [setItems]);

  const rejectItem = useCallback(async (id: string) => {
    const { error } = await supabase.from('inbox_items').update({ status: 'rejected' }).eq('id', id);
    if (error) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, [setItems]);

  const mergeItem = useCallback(async (id: string) => {
    const item = items.find((i) => i.id === id);
    // Without a known duplicate, "merge" would file the item under a null
    // target and still remove it from the queue -- silently discarding it
    // with no record of what it was supposed to match. The UI only shows
    // the merge action once a duplicate has actually been detected, but
    // guard here too rather than trust that invariant blindly.
    if (!item?.duplicate_of_publication_id) return;
    const { error } = await supabase.from('inbox_items').update({
      status: 'merged',
      filed_publication_id: item.duplicate_of_publication_id,
    }).eq('id', id);
    if (error) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, [items, setItems]);

  const postponeItem = useCallback(async (id: string) => {
    const maxSortOrder = items.reduce((max, i) => Math.max(max, i.sort_order), 0);
    const nextSortOrder = maxSortOrder + 1;
    const { error } = await supabase.from('inbox_items').update({ sort_order: nextSortOrder }).eq('id', id);
    if (error) return;
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (!target) return prev;
      const rest = prev.filter((i) => i.id !== id);
      return [...rest, { ...target, sort_order: nextSortOrder }];
    });
  }, [items, setItems]);

  return {
    items,
    loading: query.isLoading,
    createItem,
    updateItemHints,
    acceptItem,
    rejectItem,
    mergeItem,
    postponeItem,
    refresh: query.refetch,
  };
}
