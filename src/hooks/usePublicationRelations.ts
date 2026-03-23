import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PublicationRelation, Publication } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { debug, warn, error as logError } from '@/lib/logger';

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

      // Get IDs of related publications (these are vault_publications IDs)
      const relatedIds = relationsData.map((r: { publication_id: string; related_publication_id: string }) =>
        r.publication_id === publicationId ? r.related_publication_id : r.publication_id
      );

      // Fetch the publication details from vault_publications (the actual table storing papers)
      const { data: pubsData, error: pubsError } = await supabase
        .from('vault_publications')
        .select('*')
        .in('id', relatedIds);

      if (pubsError) throw pubsError;

      // Map vault_publications to Publication format and attach relation info
      const relatedPubs: RelatedPublication[] = (pubsData || []).map((vp: any) => {
        const relation = relationsData.find((r: { id: string; publication_id: string; related_publication_id: string; relation_type: string }) =>
          (r.publication_id === publicationId && r.related_publication_id === vp.id) ||
          (r.related_publication_id === publicationId && r.publication_id === vp.id)
        );
        return {
          id: vp.id,
          user_id: vp.created_by,
          title: vp.title,
          authors: vp.authors || [],
          year: vp.year,
          journal: vp.journal,
          volume: vp.volume,
          issue: vp.issue,
          pages: vp.pages,
          doi: vp.doi,
          url: vp.url,
          abstract: vp.abstract,
          pdf_url: vp.pdf_url,
          bibtex_key: vp.bibtex_key,
          publication_type: vp.publication_type || 'article',
          notes: vp.notes,
          booktitle: vp.booktitle,
          chapter: vp.chapter,
          edition: vp.edition,
          editor: vp.editor,
          howpublished: vp.howpublished,
          institution: vp.institution,
          number: vp.number,
          organization: vp.organization,
          publisher: vp.publisher,
          school: vp.school,
          series: vp.series,
          type: vp.type,
          eid: vp.eid,
          isbn: vp.isbn,
          issn: vp.issn,
          keywords: vp.keywords,
          created_at: vp.created_at,
          updated_at: vp.updated_at,
          relation_type: relation?.relation_type || 'related',
          relation_id: relation?.id || '',
        };
      });

      setRelations(relatedPubs);
    } catch (error) {
      logError('usePublicationRelations', 'Error fetching publication relations:', error);
    } finally {
      setLoading(false);
    }
  }, [publicationId]);

  useEffect(() => {
    fetchRelations();
  }, [fetchRelations]);

  const addRelation = async (relatedPublicationId: string, relationType: string) => {
    if (!publicationId || !userId) {
      warn('usePublicationRelations', 'addRelation called without publicationId or userId', { publicationId, userId });
      return false;
    }

    try {
      // Guard: prevent self-reference
      if (publicationId === relatedPublicationId) {
        toast({
          title: 'Cannot link paper to itself',
          description: 'Please select a different paper to link.',
          variant: 'destructive',
        });
        return false;
      }

      // Use vault_publications IDs directly — the FKs now reference vault_publications
      const payload = {
        publication_id: publicationId,
        related_publication_id: relatedPublicationId,
        relation_type: relationType,
        created_by: userId,
      };

      debug('usePublicationRelations', 'Inserting relation', { payload, userId });

      const { error } = await supabase
        .from('publication_relations')
        .insert(payload);

      if (error) {
        // Log full Supabase error for instrumentation
        warn('usePublicationRelations', 'Insert failed', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          payload,
        });

        // Check for duplicate
        if (error.code === '23505') {
          toast({
            title: 'Relation already exists',
            description: 'These papers are already linked.',
            variant: 'destructive',
          });
          return false;
        }

        // RLS / permission error
        if (error.message?.includes('row-level security') || error.code === '42501') {
          toast({
            title: 'Permission denied',
            description: "Can't link: you don't have permission to link papers in this vault. Contact the vault owner.",
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
      warn('usePublicationRelations', 'addRelation error', error);
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
