import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Publication, Vault, Tag } from '@/types/database';
import { fetchAllPublicationsData } from '@/lib/allPublications';

export function useAllPublications() {
  const { user } = useAuth();
  const [publications, setPublications] = useState<Publication[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [publicationVaultsMap, setPublicationVaultsMap] = useState<Record<string, string[]>>({});
  const [publicationTagsMap, setPublicationTagsMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setPublications([]);
      setVaults([]);
      setTags([]);
      setPublicationVaultsMap({});
      setPublicationTagsMap({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchAllPublicationsData(supabase, user.id, user.email ?? null);
      setPublications(data.publications);
      setVaults(data.vaults);
      setTags(data.tags);
      setPublicationVaultsMap(data.publicationVaultsMap);
      setPublicationTagsMap(data.publicationTagsMap);
    } catch (error) {
      // fetchAllPublicationsData throws on RLS denial, network blip, etc.
      // Log the error but don't crash the component tree; set loading false
      // so the UI isn't stuck in a loading state forever. Callers will see
      // empty or stale data (from previous successful load) instead of a crash.
      console.error('Failed to fetch all publications data:', error);
    } finally {
      setLoading(false);
    }
    // Depend on user.id, not the user object itself: Supabase's
    // onAuthStateChange fires (with a new `user` object of the same id) on
    // every token refresh, which happens automatically when a backgrounded
    // tab regains focus. Depending on the object reference re-triggered a
    // full reload — flashing every page that renders content only when
    // `!loading` to blank — on every tab switch, not just an actual login change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return { publications, vaults, tags, publicationVaultsMap, publicationTagsMap, loading, refetch: load };
}
