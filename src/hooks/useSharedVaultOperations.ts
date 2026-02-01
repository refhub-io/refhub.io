import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Tag, PublicationTag } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

interface OptimisticUpdate<T> {
  id: string;
  previousState: T[];
  timestamp: number;
}

interface UseSharedVaultOperationsProps {
  vaultId: string | null;
  userId: string | null;
  canEdit: boolean;
  publications: Publication[];
  setPublications: React.Dispatch<React.SetStateAction<Publication[]>>;
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  publicationTags: PublicationTag[];
  setPublicationTags: React.Dispatch<React.SetStateAction<PublicationTag[]>>;
}

interface UpdatePublicationData extends Partial<Publication> {
  id: string;
}

/**
 * Hook for managing shared vault operations with optimistic updates.
 * Provides methods for updating publications and tags that:
 * 1. Apply optimistic updates immediately to local state
 * 2. Persist changes to the database
 * 3. Rollback on error
 * 4. Allow realtime subscriptions to propagate changes to other clients
 */
export function useSharedVaultOperations({
  vaultId,
  userId,
  canEdit,
  publications,
  setPublications,
  tags,
  setTags,
  publicationTags,
  setPublicationTags,
}: UseSharedVaultOperationsProps) {
  const { toast } = useToast();
  
  // Track pending optimistic updates for rollback
  const pendingPublicationUpdates = useRef<Map<string, OptimisticUpdate<Publication>>>(new Map());
  const pendingTagUpdates = useRef<Map<string, OptimisticUpdate<Tag>>>(new Map());
  const pendingPublicationTagUpdates = useRef<Map<string, OptimisticUpdate<PublicationTag>>>(new Map());

  /**
   * Generate a unique operation ID for tracking optimistic updates
   */
  const generateOperationId = () => `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  /**
   * Update a vault publication with optimistic update pattern
   */
  const updateVaultPublication = useCallback(async (
    publicationId: string,
    updates: Partial<Publication>,
    options: { silent?: boolean } = {}
  ): Promise<{ success: boolean; error?: Error }> => {
    if (!vaultId || !userId || !canEdit) {
      return { success: false, error: new Error('Not authorized to edit') };
    }

    const operationId = generateOperationId();
    const previousPublications = [...publications];

    // Store previous state for potential rollback
    pendingPublicationUpdates.current.set(operationId, {
      id: publicationId,
      previousState: previousPublications,
      timestamp: Date.now(),
    });

    // Apply optimistic update immediately
    const optimisticPublication: Publication = {
      ...publications.find(p => p.id === publicationId)!,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    setPublications(prev => 
      prev.map(pub => pub.id === publicationId ? optimisticPublication : pub)
    );

    try {
      // Persist to database
      const dataToSave = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      // Remove fields that shouldn't be sent to vault_publications
      delete (dataToSave as any).id;
      delete (dataToSave as any).user_id;
      delete (dataToSave as any).created_at;
      delete (dataToSave as any).original_publication_id;

      const { error } = await supabase
        .from('vault_publications')
        .update(dataToSave)
        .eq('id', publicationId);

      if (error) throw error;

      // Clean up pending update tracking
      pendingPublicationUpdates.current.delete(operationId);

      if (!options.silent) {
        toast({ title: 'paper_updated ✨' });
      }

      return { success: true };
    } catch (error) {
      // Rollback optimistic update on error
      const pending = pendingPublicationUpdates.current.get(operationId);
      if (pending) {
        setPublications(pending.previousState);
        pendingPublicationUpdates.current.delete(operationId);
      }

      if (!options.silent) {
        toast({
          title: 'error_saving_paper',
          description: (error as Error).message,
          variant: 'destructive',
        });
      }

      return { success: false, error: error as Error };
    }
  }, [vaultId, userId, canEdit, publications, setPublications, toast]);

  /**
   * Create a new tag in the shared vault with optimistic update
   */
  const createTag = useCallback(async (
    name: string,
    parentId?: string,
    color?: string
  ): Promise<{ success: boolean; tag?: Tag; error?: Error }> => {
    if (!vaultId || !userId || !canEdit) {
      return { success: false, error: new Error('Not authorized to create tags') };
    }

    const operationId = generateOperationId();
    const previousTags = [...tags];

    // Generate a temporary ID for optimistic update
    const tempId = `temp_${operationId}`;
    const colors = ['#a855f7', '#ec4899', '#f43f5e', '#22c55e', '#06b6d4', '#3b82f6', '#f97316'];
    
    // If parent exists, inherit parent's color for consistency
    let tagColor = color || colors[Math.floor(Math.random() * colors.length)];
    if (parentId) {
      const parentTag = tags.find(t => t.id === parentId);
      if (parentTag) {
        tagColor = parentTag.color;
      }
    }

    // Calculate depth based on parent
    let depth = 0;
    if (parentId) {
      const parentTag = tags.find(t => t.id === parentId);
      if (parentTag) {
        depth = parentTag.depth + 1;
      }
    }

    // Create optimistic tag
    const optimisticTag: Tag = {
      id: tempId,
      user_id: userId,
      name,
      color: tagColor,
      parent_id: parentId || null,
      depth,
      created_at: new Date().toISOString(),
    };

    // Store previous state for potential rollback
    pendingTagUpdates.current.set(operationId, {
      id: tempId,
      previousState: previousTags,
      timestamp: Date.now(),
    });

    // Apply optimistic update
    setTags(prev => [...prev, optimisticTag]);

    try {
      // Persist to database
      const { data, error } = await supabase
        .from('tags')
        .insert({
          name,
          color: tagColor,
          user_id: userId,
          parent_id: parentId || null,
          vault_id: vaultId,
        })
        .select()
        .single();

      if (error) throw error;

      // Replace temporary tag with real one from database
      setTags(prev => 
        prev.map(tag => tag.id === tempId ? (data as Tag) : tag)
      );

      // Clean up pending update tracking
      pendingTagUpdates.current.delete(operationId);

      return { success: true, tag: data as Tag };
    } catch (error) {
      // Rollback optimistic update on error
      const pending = pendingTagUpdates.current.get(operationId);
      if (pending) {
        setTags(pending.previousState);
        pendingTagUpdates.current.delete(operationId);
      }

      // Check if the error is due to unique constraint violation
      if ((error as any)?.code === '23505') {
        toast({
          title: 'Tag already exists',
          description: `A tag with the name "${name}" already exists in this vault.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'error_creating_tag',
          description: (error as Error).message,
          variant: 'destructive',
        });
      }

      return { success: false, error: error as Error };
    }
  }, [vaultId, userId, canEdit, tags, setTags, toast]);

  /**
   * Update an existing tag with optimistic update
   */
  const updateTag = useCallback(async (
    tagId: string,
    updates: Partial<Tag>
  ): Promise<{ success: boolean; tag?: Tag; error?: Error }> => {
    if (!userId || !canEdit) {
      return { success: false, error: new Error('Not authorized to update tags') };
    }

    const operationId = generateOperationId();
    const previousTags = [...tags];
    const existingTag = tags.find(t => t.id === tagId);

    if (!existingTag) {
      return { success: false, error: new Error('Tag not found') };
    }

    // Store previous state for potential rollback
    pendingTagUpdates.current.set(operationId, {
      id: tagId,
      previousState: previousTags,
      timestamp: Date.now(),
    });

    // Apply optimistic update
    const optimisticTag: Tag = { ...existingTag, ...updates };
    setTags(prev => prev.map(tag => tag.id === tagId ? optimisticTag : tag));

    try {
      const { data, error } = await supabase
        .from('tags')
        .update(updates)
        .eq('id', tagId)
        .select()
        .single();

      if (error) throw error;

      // Update with real data from database
      setTags(prev => prev.map(tag => tag.id === tagId ? (data as Tag) : tag));

      // Clean up pending update tracking
      pendingTagUpdates.current.delete(operationId);

      return { success: true, tag: data as Tag };
    } catch (error) {
      // Rollback optimistic update on error
      const pending = pendingTagUpdates.current.get(operationId);
      if (pending) {
        setTags(pending.previousState);
        pendingTagUpdates.current.delete(operationId);
      }

      toast({
        title: 'error_updating_tag',
        description: (error as Error).message,
        variant: 'destructive',
      });

      return { success: false, error: error as Error };
    }
  }, [userId, canEdit, tags, setTags, toast]);

  /**
   * Delete a tag with optimistic update
   */
  const deleteTag = useCallback(async (
    tagId: string
  ): Promise<{ success: boolean; error?: Error }> => {
    if (!userId || !canEdit) {
      return { success: false, error: new Error('Not authorized to delete tags') };
    }

    const operationId = generateOperationId();
    const previousTags = [...tags];
    const previousPublicationTags = [...publicationTags];

    // Store previous state for potential rollback
    pendingTagUpdates.current.set(operationId, {
      id: tagId,
      previousState: previousTags,
      timestamp: Date.now(),
    });

    // Apply optimistic update - remove tag and its children
    const tagIdsToRemove = new Set<string>();
    const collectChildTags = (parentId: string) => {
      tagIdsToRemove.add(parentId);
      tags.filter(t => t.parent_id === parentId).forEach(t => collectChildTags(t.id));
    };
    collectChildTags(tagId);

    setTags(prev => prev.filter(tag => !tagIdsToRemove.has(tag.id)));
    setPublicationTags(prev => prev.filter(pt => !tagIdsToRemove.has(pt.tag_id)));

    try {
      // Note: Child tags and publication_tags will be deleted via CASCADE
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagId);

      if (error) throw error;

      // Clean up pending update tracking
      pendingTagUpdates.current.delete(operationId);

      return { success: true };
    } catch (error) {
      // Rollback optimistic update on error
      const pending = pendingTagUpdates.current.get(operationId);
      if (pending) {
        setTags(pending.previousState);
        setPublicationTags(previousPublicationTags);
        pendingTagUpdates.current.delete(operationId);
      }

      toast({
        title: 'error_deleting_tag',
        description: (error as Error).message,
        variant: 'destructive',
      });

      return { success: false, error: error as Error };
    }
  }, [userId, canEdit, tags, publicationTags, setTags, setPublicationTags, toast]);

  /**
   * Update publication tags with optimistic update
   */
  const updatePublicationTags = useCallback(async (
    publicationId: string,
    newTagIds: string[],
    options: { silent?: boolean } = {}
  ): Promise<{ success: boolean; error?: Error }> => {
    if (!vaultId || !userId || !canEdit) {
      return { success: false, error: new Error('Not authorized to update tags') };
    }

    const operationId = generateOperationId();
    const previousPublicationTags = [...publicationTags];

    // Get existing tag associations for this publication
    const existingTagIds = publicationTags
      .filter(pt => pt.vault_publication_id === publicationId || pt.publication_id === publicationId)
      .map(pt => pt.tag_id);

    // Calculate tags to add and remove
    const tagsToAdd = newTagIds.filter(id => !existingTagIds.includes(id));
    const tagsToRemove = existingTagIds.filter(id => !newTagIds.includes(id));

    // Store previous state for potential rollback
    pendingPublicationTagUpdates.current.set(operationId, {
      id: publicationId,
      previousState: previousPublicationTags,
      timestamp: Date.now(),
    });

    // Apply optimistic update
    setPublicationTags(prev => {
      // Remove old associations
      const filtered = prev.filter(pt => 
        !(pt.vault_publication_id === publicationId || pt.publication_id === publicationId) ||
        !tagsToRemove.includes(pt.tag_id)
      );
      
      // Add new associations
      const newAssociations = tagsToAdd.map(tagId => ({
        id: `temp_${operationId}_${tagId}`,
        publication_id: null as string | null,
        vault_publication_id: publicationId,
        tag_id: tagId,
      }));

      return [...filtered, ...newAssociations] as PublicationTag[];
    });

    try {
      // Validate that all tag IDs exist in the current vault
      if (newTagIds.length > 0) {
        const { data: validTags, error: validationError } = await supabase
          .from('tags')
          .select('id')
          .in('id', newTagIds)
          .eq('vault_id', vaultId);

        if (validationError) throw validationError;

        const validTagIds = new Set(validTags?.map(tag => tag.id) || []);
        const invalidTags = newTagIds.filter(id => !validTagIds.has(id));

        if (invalidTags.length > 0) {
          throw new Error('Some tags do not belong to this vault');
        }
      }

      // Delete removed tags
      if (tagsToRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('publication_tags')
          .delete()
          .eq('vault_publication_id', publicationId)
          .in('tag_id', tagsToRemove);

        if (deleteError) throw deleteError;
      }

      // Insert new tags
      if (tagsToAdd.length > 0) {
        const { data: insertedTags, error: insertError } = await supabase
          .from('publication_tags')
          .insert(
            tagsToAdd.map(tagId => ({
              publication_id: null,
              vault_publication_id: publicationId,
              tag_id: tagId,
            }))
          )
          .select();

        if (insertError) throw insertError;

        // Replace temporary IDs with real ones
        if (insertedTags) {
          setPublicationTags(prev => {
            const withoutTemp = prev.filter(pt => 
              !pt.id.startsWith(`temp_${operationId}`)
            );
            return [...withoutTemp, ...insertedTags as PublicationTag[]];
          });
        }
      }

      // Clean up pending update tracking
      pendingPublicationTagUpdates.current.delete(operationId);

      if (!options.silent) {
        toast({ title: 'tags_updated ✨' });
      }

      return { success: true };
    } catch (error) {
      // Rollback optimistic update on error
      const pending = pendingPublicationTagUpdates.current.get(operationId);
      if (pending) {
        setPublicationTags(pending.previousState);
        pendingPublicationTagUpdates.current.delete(operationId);
      }

      if (!options.silent) {
        toast({
          title: 'error_updating_tags',
          description: (error as Error).message,
          variant: 'destructive',
        });
      }

      return { success: false, error: error as Error };
    }
  }, [vaultId, userId, canEdit, publicationTags, setPublicationTags, toast]);

  /**
   * Create a new publication in the vault with optimistic update
   */
  const createVaultPublication = useCallback(async (
    data: Partial<Publication>,
    tagIds: string[] = []
  ): Promise<{ success: boolean; publication?: Publication; error?: Error }> => {
    if (!vaultId || !userId || !canEdit) {
      return { success: false, error: new Error('Not authorized to create publications') };
    }

    const operationId = generateOperationId();
    const tempId = `temp_${operationId}`;
    const previousPublications = [...publications];

    // Create optimistic publication
    const optimisticPublication: Publication = {
      id: tempId,
      user_id: userId,
      title: data.title || '',
      authors: data.authors || [],
      year: data.year || null,
      journal: data.journal || null,
      volume: data.volume || null,
      issue: data.issue || null,
      pages: data.pages || null,
      doi: data.doi || null,
      url: data.url || null,
      abstract: data.abstract || null,
      pdf_url: data.pdf_url || null,
      bibtex_key: data.bibtex_key || null,
      publication_type: data.publication_type || 'article',
      notes: data.notes || null,
      booktitle: data.booktitle || null,
      chapter: data.chapter || null,
      edition: data.edition || null,
      editor: data.editor || null,
      howpublished: data.howpublished || null,
      institution: data.institution || null,
      number: data.number || null,
      organization: data.organization || null,
      publisher: data.publisher || null,
      school: data.school || null,
      series: data.series || null,
      type: data.type || null,
      eid: data.eid || null,
      isbn: data.isbn || null,
      issn: data.issn || null,
      keywords: data.keywords || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Store previous state for potential rollback
    pendingPublicationUpdates.current.set(operationId, {
      id: tempId,
      previousState: previousPublications,
      timestamp: Date.now(),
    });

    // Apply optimistic update
    setPublications(prev => [optimisticPublication, ...prev]);

    try {
      // First create the user's publication
      const { data: newPub, error: pubError } = await supabase
        .from('publications')
        .insert([{
          ...data,
          user_id: userId,
        } as Omit<Publication, 'id' | 'created_at' | 'updated_at'>])
        .select()
        .single();

      if (pubError) throw pubError;

      // Then create the vault-specific copy
      const { data: vaultPub, error: vaultPubError } = await supabase
        .from('vault_publications')
        .insert({
          vault_id: vaultId,
          original_publication_id: newPub.id,
          ...data,
          created_by: userId,
        })
        .select()
        .single();

      if (vaultPubError) throw vaultPubError;

      // Convert vault publication to Publication format
      const finalPublication: Publication = {
        id: vaultPub.id,
        user_id: userId,
        title: vaultPub.title,
        authors: vaultPub.authors || [],
        year: vaultPub.year,
        journal: vaultPub.journal,
        volume: vaultPub.volume,
        issue: vaultPub.issue,
        pages: vaultPub.pages,
        doi: vaultPub.doi,
        url: vaultPub.url,
        abstract: vaultPub.abstract,
        pdf_url: vaultPub.pdf_url,
        bibtex_key: vaultPub.bibtex_key,
        publication_type: vaultPub.publication_type || 'article',
        notes: vaultPub.notes,
        booktitle: vaultPub.booktitle,
        chapter: vaultPub.chapter,
        edition: vaultPub.edition,
        editor: vaultPub.editor,
        howpublished: vaultPub.howpublished,
        institution: vaultPub.institution,
        number: vaultPub.number,
        organization: vaultPub.organization,
        publisher: vaultPub.publisher,
        school: vaultPub.school,
        series: vaultPub.series,
        type: vaultPub.type,
        eid: vaultPub.eid,
        isbn: vaultPub.isbn,
        issn: vaultPub.issn,
        keywords: vaultPub.keywords,
        created_at: vaultPub.created_at,
        updated_at: vaultPub.updated_at,
      };

      // Replace temporary publication with real one
      // Also filter out any duplicates that might have been added by realtime
      setPublications(prev => {
        // First, filter out any realtime-added duplicates with the same real ID
        const filtered = prev.filter(pub => pub.id !== vaultPub.id);
        // Then map to replace temp with final
        return filtered.map(pub => pub.id === tempId ? finalPublication : pub);
      });

      // Add tags if provided
      if (tagIds.length > 0) {
        await supabase.from('publication_tags').insert(
          tagIds.map(tagId => ({
            publication_id: null,
            vault_publication_id: vaultPub.id,
            tag_id: tagId,
          }))
        );

        // Update local publication tags state
        setPublicationTags(prev => [
          ...prev,
          ...tagIds.map(tagId => ({
            id: `${vaultPub.id}_${tagId}`,
            publication_id: null as string | null,
            vault_publication_id: vaultPub.id,
            tag_id: tagId,
          })) as PublicationTag[],
        ]);
      }

      // Clean up pending update tracking
      pendingPublicationUpdates.current.delete(operationId);

      toast({ title: 'paper_added ✨' });

      return { success: true, publication: finalPublication };
    } catch (error) {
      // Rollback optimistic update on error
      const pending = pendingPublicationUpdates.current.get(operationId);
      if (pending) {
        setPublications(pending.previousState);
        pendingPublicationUpdates.current.delete(operationId);
      }

      toast({
        title: 'error_creating_paper',
        description: (error as Error).message,
        variant: 'destructive',
      });

      return { success: false, error: error as Error };
    }
  }, [vaultId, userId, canEdit, publications, setPublications, setPublicationTags, toast]);

  /**
   * Delete a publication from the vault with optimistic update
   */
  const deleteVaultPublication = useCallback(async (
    publicationId: string
  ): Promise<{ success: boolean; error?: Error }> => {
    if (!vaultId || !userId || !canEdit) {
      return { success: false, error: new Error('Not authorized to delete publications') };
    }

    const operationId = generateOperationId();
    const previousPublications = [...publications];
    const previousPublicationTags = [...publicationTags];

    // Store previous state for potential rollback
    pendingPublicationUpdates.current.set(operationId, {
      id: publicationId,
      previousState: previousPublications,
      timestamp: Date.now(),
    });

    // Apply optimistic update
    setPublications(prev => prev.filter(pub => pub.id !== publicationId));
    setPublicationTags(prev => prev.filter(pt => 
      pt.vault_publication_id !== publicationId && pt.publication_id !== publicationId
    ));

    try {
      const { error } = await supabase
        .from('vault_publications')
        .delete()
        .eq('id', publicationId);

      if (error) throw error;

      // Clean up pending update tracking
      pendingPublicationUpdates.current.delete(operationId);

      toast({ title: 'paper_removed ✨' });

      return { success: true };
    } catch (error) {
      // Rollback optimistic update on error
      const pending = pendingPublicationUpdates.current.get(operationId);
      if (pending) {
        setPublications(pending.previousState);
        setPublicationTags(previousPublicationTags);
        pendingPublicationUpdates.current.delete(operationId);
      }

      toast({
        title: 'error_deleting_paper',
        description: (error as Error).message,
        variant: 'destructive',
      });

      return { success: false, error: error as Error };
    }
  }, [vaultId, userId, canEdit, publications, publicationTags, setPublications, setPublicationTags, toast]);

  /**
   * Handle incoming realtime updates from other clients
   * This should be called when processing realtime events to properly merge
   * with any pending optimistic updates
   */
  const handleRealtimePublicationUpdate = useCallback((
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: any
  ) => {
    const publicationId = payload.id;

    // Check if we have a pending update for this publication
    const hasPendingUpdate = Array.from(pendingPublicationUpdates.current.values())
      .some(update => update.id === publicationId);

    // If we have a pending update, ignore the realtime update
    // (our local state is ahead of the server)
    if (hasPendingUpdate) {
      console.log('[Realtime] Ignoring update for publication with pending optimistic update:', publicationId);
      return;
    }

    // Apply the realtime update
    if (eventType === 'INSERT') {
      // Check if we already have this publication (from our own optimistic update)
      setPublications(prev => {
        if (prev.some(p => p.id === publicationId)) {
          return prev;
        }
        // Convert vault publication to Publication format
        const newPub: Publication = {
          id: payload.id,
          user_id: payload.created_by,
          title: payload.title,
          authors: payload.authors || [],
          year: payload.year,
          journal: payload.journal,
          volume: payload.volume,
          issue: payload.issue,
          pages: payload.pages,
          doi: payload.doi,
          url: payload.url,
          abstract: payload.abstract,
          pdf_url: payload.pdf_url,
          bibtex_key: payload.bibtex_key,
          publication_type: payload.publication_type || 'article',
          notes: payload.notes,
          booktitle: payload.booktitle,
          chapter: payload.chapter,
          edition: payload.edition,
          editor: payload.editor,
          howpublished: payload.howpublished,
          institution: payload.institution,
          number: payload.number,
          organization: payload.organization,
          publisher: payload.publisher,
          school: payload.school,
          series: payload.series,
          type: payload.type,
          eid: payload.eid,
          isbn: payload.isbn,
          issn: payload.issn,
          keywords: payload.keywords,
          created_at: payload.created_at,
          updated_at: payload.updated_at,
        };
        return [newPub, ...prev];
      });
    } else if (eventType === 'UPDATE') {
      setPublications(prev =>
        prev.map(pub =>
          pub.id === publicationId
            ? {
                ...pub,
                ...payload,
                user_id: pub.user_id, // Preserve original user_id
              }
            : pub
        )
      );
    } else if (eventType === 'DELETE') {
      setPublications(prev => prev.filter(pub => pub.id !== publicationId));
    }
  }, [setPublications]);

  /**
   * Handle incoming realtime tag updates from other clients
   */
  const handleRealtimeTagUpdate = useCallback((
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: any
  ) => {
    const tagId = payload.id;

    // Check if we have a pending update for this tag
    const hasPendingUpdate = Array.from(pendingTagUpdates.current.values())
      .some(update => update.id === tagId);

    if (hasPendingUpdate) {
      console.log('[Realtime] Ignoring update for tag with pending optimistic update:', tagId);
      return;
    }

    if (eventType === 'INSERT') {
      setTags(prev => {
        if (prev.some(t => t.id === tagId)) {
          return prev;
        }
        return [...prev, payload as Tag];
      });
    } else if (eventType === 'UPDATE') {
      setTags(prev => prev.map(tag => tag.id === tagId ? { ...tag, ...payload } : tag));
    } else if (eventType === 'DELETE') {
      setTags(prev => prev.filter(tag => tag.id !== tagId));
    }
  }, [setTags]);

  /**
   * Handle incoming realtime publication tag updates from other clients
   */
  const handleRealtimePublicationTagUpdate = useCallback((
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: any
  ) => {
    const tagAssociationId = payload.id;

    // Check if we have a pending update that might conflict
    const hasPendingUpdate = Array.from(pendingPublicationTagUpdates.current.values())
      .some(update => update.id === payload.vault_publication_id || update.id === payload.publication_id);

    if (hasPendingUpdate) {
      console.log('[Realtime] Ignoring publication tag update with pending optimistic update');
      return;
    }

    if (eventType === 'INSERT') {
      setPublicationTags(prev => {
        if (prev.some(pt => pt.id === tagAssociationId)) {
          return prev;
        }
        return [...prev, payload as PublicationTag];
      });
    } else if (eventType === 'UPDATE') {
      setPublicationTags(prev => 
        prev.map(pt => pt.id === tagAssociationId ? { ...pt, ...payload } : pt)
      );
    } else if (eventType === 'DELETE') {
      setPublicationTags(prev => prev.filter(pt => pt.id !== tagAssociationId));
    }
  }, [setPublicationTags]);

  return {
    // Publication operations
    updateVaultPublication,
    createVaultPublication,
    deleteVaultPublication,
    
    // Tag operations
    createTag,
    updateTag,
    deleteTag,
    
    // Publication tag operations
    updatePublicationTags,
    
    // Realtime handlers
    handleRealtimePublicationUpdate,
    handleRealtimeTagUpdate,
    handleRealtimePublicationTagUpdate,
  };
}
