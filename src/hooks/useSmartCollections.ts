import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import type { SmartCollection } from '@/types/database';
import {
  fetchSmartCollections,
  createSmartCollection,
  updateSmartCollection,
  deleteSmartCollection,
  type SmartCollectionInput,
} from '@/lib/smartCollections';

export function useSmartCollections() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [collections, setCollections] = useState<SmartCollection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setCollections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchSmartCollections(supabase, user.id);
      setCollections(data);
    } catch (error) {
      toast({ title: 'Could not load smart collections', variant: 'destructive', feedbackSeverity: 'error' });
    } finally {
      setLoading(false);
    }
    // Depend on user.id, not the user object itself: Supabase's
    // onAuthStateChange fires (with a new `user` object of the same id) on
    // every token refresh, which happens automatically when a backgrounded
    // tab regains focus. Depending on the object reference re-triggered a
    // full reload — flashing this page's content to blank on every tab
    // switch, not just an actual login change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const createCollectionFn = useCallback(
    async (input: SmartCollectionInput): Promise<SmartCollection | null> => {
      if (!user) return null;
      try {
        const created = await createSmartCollection(supabase, user.id, input);
        setCollections((prev) => [created, ...prev]);
        toast({ title: 'Smart collection created ✨' });
        return created;
      } catch (error) {
        toast({ title: 'Could not create smart collection', variant: 'destructive', feedbackSeverity: 'error' });
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, toast],
  );

  const updateCollectionFn = useCallback(
    async (id: string, input: SmartCollectionInput): Promise<SmartCollection | null> => {
      try {
        const updated = await updateSmartCollection(supabase, id, input);
        setCollections((prev) => prev.map((c) => (c.id === id ? updated : c)));
        toast({ title: 'Smart collection updated ✨' });
        return updated;
      } catch (error) {
        toast({ title: 'Could not update smart collection', variant: 'destructive', feedbackSeverity: 'error' });
        return null;
      }
    },
    [toast],
  );

  const deleteCollectionFn = useCallback(
    async (id: string): Promise<boolean> => {
      const previous = collections;
      setCollections((prev) => prev.filter((c) => c.id !== id));
      try {
        await deleteSmartCollection(supabase, id);
        return true;
      } catch (error) {
        setCollections(previous);
        toast({ title: 'Could not delete smart collection', variant: 'destructive', feedbackSeverity: 'error' });
        return false;
      }
    },
    [collections, toast],
  );

  return {
    collections,
    loading,
    createCollection: createCollectionFn,
    updateCollection: updateCollectionFn,
    deleteCollection: deleteCollectionFn,
  };
}
