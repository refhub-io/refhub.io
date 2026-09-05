import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { InboxItem, InboxSourceType, Publication } from '@/types/database';

export interface CreateInboxItemInput {
  sourceType: InboxSourceType;
  sourceRef: string;
  parsedFields: Partial<Publication>;
}

export function useInbox() {
  const { user } = useAuth();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('inbox_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (!error) setItems((data || []) as InboxItem[]);
    setLoading(false);
    // Depend on user?.id, not the user object — same reasoning as
    // useAllPublications.ts and VaultDetail.tsx's own fetch: Supabase's
    // onAuthStateChange fires a new user object of the same id on every
    // token refresh, and depending on the object reference risks a
    // transient failure never getting a real retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

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
    // Depend on user?.id, not the user object — same reasoning as
    // refresh() above: Supabase's onAuthStateChange fires a new user object
    // of the same id on every token refresh, and depending on the object
    // reference risks unnecessary reruns in consumers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const updateItemHints = useCallback(async (
    id: string,
    hints: Partial<Pick<InboxItem, 'duplicate_of_publication_id' | 'suggested_vault_id' | 'suggested_tag_ids'>>,
  ) => {
    const { error } = await supabase.from('inbox_items').update(hints).eq('id', id);
    if (error) return;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...hints } : item)));
  }, []);

  const acceptItem = useCallback(async (id: string, vaultId: string, tagIds: string[], filedPublicationId: string) => {
    const { error } = await supabase.from('inbox_items').update({
      status: 'accepted',
      suggested_vault_id: vaultId,
      suggested_tag_ids: tagIds,
      filed_publication_id: filedPublicationId,
    }).eq('id', id);
    if (error) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const rejectItem = useCallback(async (id: string) => {
    const { error } = await supabase.from('inbox_items').update({ status: 'rejected' }).eq('id', id);
    if (error) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const mergeItem = useCallback(async (id: string) => {
    const item = items.find((i) => i.id === id);
    const { error } = await supabase.from('inbox_items').update({
      status: 'merged',
      filed_publication_id: item?.duplicate_of_publication_id ?? null,
    }).eq('id', id);
    if (error) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, [items]);

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
  }, [items]);

  return { items, loading, createItem, updateItemHints, acceptItem, rejectItem, mergeItem, postponeItem, refresh };
}
