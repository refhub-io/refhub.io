import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PublicationRelation, Publication } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

interface RelatedPublication extends Publication {
  relation_type: string;
  relation_id: string;
}

export function usePublicationRelations(publicationId: string | null, userId: string | null) {
  const [relations, setRelations] = useState<RelatedPublication[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchRelations = useCallback(async () => {
    if (!publicationId) {
      setRelations([]);
      return;
    }

    setLoading(true);
    try {
      // Fetch relations where this publication is either the source or target (bidirectional)
      const { data: relationsData, error: relationsError } = await supabase
        .from('publication_relations')
        .select('*')
        .or(`publication_id.eq.${publicationId},related_publication_id.eq.${publicationId}`);

      if (relationsError) throw relationsError;

      if (!relationsData || relationsData.length === 0) {
        setRelations([]);
        return;
      }

      // Get IDs of related publications
      const relatedIds = relationsData.map((r: { publication_id: string; related_publication_id: string }) =>
        r.publication_id === publicationId ? r.related_publication_id : r.publication_id
      );

      // Fetch the publication details
      const { data: pubsData, error: pubsError } = await supabase
        .from('publications')
        .select('*')
        .in('id', relatedIds);

      if (pubsError) throw pubsError;

      // Map publications with their relation info
      const relatedPubs: RelatedPublication[] = (pubsData || []).map((pub: Publication) => {
        const relation = relationsData.find((r: { id: string; publication_id: string; related_publication_id: string; relation_type: string }) =>
          (r.publication_id === publicationId && r.related_publication_id === pub.id) ||
          (r.related_publication_id === publicationId && r.publication_id === pub.id)
        );
        return {
          ...pub,
          relation_type: relation?.relation_type || 'related',
          relation_id: relation?.id || '',
        };
      });

      setRelations(relatedPubs);
    } catch (error) {
      console.error('Error fetching publication relations:', error);
    } finally {
      setLoading(false);
    }
  }, [publicationId]);

  useEffect(() => {
    fetchRelations();
  }, [fetchRelations]);

  const addRelation = async (relatedPublicationId: string, relationType: string) => {
    if (!publicationId || !userId) return false;

    try {
      const { error } = await supabase
        .from('publication_relations')
        .insert({
          publication_id: publicationId,
          related_publication_id: relatedPublicationId,
          relation_type: relationType,
          created_by: userId,
        });

      if (error) {
        // Check for duplicate
        if (error.code === '23505') {
          toast({
            title: 'Relation already exists',
            description: 'These papers are already linked.',
            variant: 'destructive',
          });
          return false;
        }
        throw error;
      }

      await fetchRelations();
      toast({ title: 'Papers linked ✨' });
      return true;
    } catch (error) {
      toast({
        title: 'Error linking papers',
        description: (error as Error).message,
        variant: 'destructive',
      });
      return false;
    }
  };

  const removeRelation = async (relationId: string) => {
    try {
      const { error } = await supabase
        .from('publication_relations')
        .delete()
        .eq('id', relationId);

      if (error) throw error;

      await fetchRelations();
      toast({ title: 'Link removed' });
      return true;
    } catch (error) {
      toast({
        title: 'Error removing link',
        description: (error as Error).message,
        variant: 'destructive',
      });
      return false;
    }
  };

  return {
    relations,
    loading,
    addRelation,
    removeRelation,
    refreshRelations: fetchRelations,
  };
}
