import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { InboxItem, InboxSourceType, Publication } from '@/types/database';

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
    const { error } = await supabase.from('inbox_items').update({
      status: 'merged',
      filed_publication_id: item?.duplicate_of_publication_id ?? null,
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
