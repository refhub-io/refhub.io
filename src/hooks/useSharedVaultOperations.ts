import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Publication, Tag, PublicationTag } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { extractBibliographicPatch } from '@/lib/publicationSync';
import { formatVaultPublication } from '@/lib/formatVaultPublication';
import { logger } from '@/lib/logger';
import type { VaultContentEdits } from '@/lib/vaultContentEdits';

interface UseSharedVaultOperationsProps {
  vaultId: string | null;
  userId: string | null;
  canEdit: boolean;
  publications: Publication[];
  tags: Tag[];
  publicationTags: PublicationTag[];
  /** The vault content's named edits (useVaultContentActions). A rollback undoes only what its
   * operation changed, so other people's changes that arrived meanwhile stay. */
  edits: VaultContentEdits;
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
  tags,
  publicationTags,
  edits,
}: UseSharedVaultOperationsProps) {
  const { toast } = useToast();
  
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

    // Apply optimistic update immediately
    const previousPublication = publications.find(p => p.id === publicationId);
    edits.updatePublication(publicationId, { ...updates, updated_at: new Date().toISOString() });

    try {
      // Persist to database
      const dataToSave = {
        ...updates,
        updated_at: new Date().toISOString(),
        updated_by: userId, // Track who made the update
      };

      // Remove fields that shouldn't be sent to vault_publications
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (dataToSave as any).id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (dataToSave as any).user_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (dataToSave as any).created_at;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (dataToSave as any).original_publication_id;

      const { error } = await supabase
        .from('vault_publications')
        .update(dataToSave)
        .eq('id', publicationId);

      if (error) throw error;

      // Fan out bibliographic changes to canonical publication and sibling vault copies.
      // Notes and tags are vault-specific and are excluded by extractBibliographicPatch.
      const vaultPub = publications.find(p => p.id === publicationId);
      const originalId = vaultPub?.original_publication_id;
      if (originalId) {
        const bibPatch = extractBibliographicPatch(updates);
        if (Object.keys(bibPatch).length > 0) {
          const now = new Date().toISOString();
          // Canonical publications record (no updated_by column)
          supabase.from('publications')
            .update({ ...bibPatch, updated_at: now })
            .eq('id', originalId)
            .then(({ error: e }) => { if (e) logger.warn('sync', 'canonical fan-out error:', e.message); });
          // Sibling vault copies in other vaults
          supabase.from('vault_publications')
            .update({ ...bibPatch, updated_at: now, updated_by: userId })
            .eq('original_publication_id', originalId)
            .neq('id', publicationId)
            .then(({ error: e }) => { if (e) logger.warn('sync', 'sibling fan-out error:', e.message); });
        }
      }

      if (!options.silent) {
        toast({ title: 'paper_updated ✨' });
      }

      return { success: true };
    } catch (error) {
      // Roll back only the paper this call touched: others may have changed and saved since
      // (e.g. the sibling patches of a vault health check batch apply).
      if (previousPublication) edits.replacePublication(publicationId, previousPublication);

      if (!options.silent) {
        toast({
          title: 'error_saving_paper',
          description: (error as Error).message,
          variant: 'destructive', feedbackSeverity: 'error',
        });
      }

      return { success: false, error: error as Error };
    }
  }, [vaultId, userId, canEdit, publications, edits, toast]);

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

    // Apply optimistic update
    edits.addTags([optimisticTag]);

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
      edits.replaceTag(tempId, data as Tag);

      return { success: true, tag: data as Tag };
    } catch (error) {
      // Rollback optimistic update on error
      edits.removeTags([tempId]);

      // Check if the error is due to unique constraint violation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any)?.code === '23505') {
        toast({
          title: 'Tag already exists',
          description: `A tag with the name "${name}" already exists in this vault.`,
          variant: 'destructive', feedbackSeverity: 'error',
        });
      } else {
        toast({
          title: 'error_creating_tag',
          description: (error as Error).message,
          variant: 'destructive', feedbackSeverity: 'error',
        });
      }

      return { success: false, error: error as Error };
    }
  }, [vaultId, userId, canEdit, tags, edits, toast]);

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

    const existingTag = tags.find(t => t.id === tagId);

    if (!existingTag) {
      return { success: false, error: new Error('Tag not found') };
    }

    // Apply optimistic update
    const optimisticTag: Tag = { ...existingTag, ...updates };
    edits.replaceTag(tagId, optimisticTag);

    try {
      const { data, error } = await supabase
        .from('tags')
        .update(updates)
        .eq('id', tagId)
        .select()
        .single();

      if (error) throw error;

      // Update with real data from database
      edits.replaceTag(tagId, data as Tag);

      return { success: true, tag: data as Tag };
    } catch (error) {
      // Rollback optimistic update on error
      edits.replaceTag(tagId, existingTag);

      toast({
        title: 'error_updating_tag',
        description: (error as Error).message,
        variant: 'destructive', feedbackSeverity: 'error',
      });

      return { success: false, error: error as Error };
    }
  }, [userId, canEdit, tags, edits, toast]);

  /**
   * Delete a tag with optimistic update
   */
  const deleteTag = useCallback(async (
    tagId: string
  ): Promise<{ success: boolean; error?: Error }> => {
    if (!userId || !canEdit) {
      return { success: false, error: new Error('Not authorized to delete tags') };
    }

    // Apply optimistic update - remove tag and its children
    const tagIdsToRemove = new Set<string>();
    const collectChildTags = (parentId: string) => {
      tagIdsToRemove.add(parentId);
      tags.filter(t => t.parent_id === parentId).forEach(t => collectChildTags(t.id));
    };
    collectChildTags(tagId);

    const removedTags = tags.filter(tag => tagIdsToRemove.has(tag.id));
    const removedLinks = publicationTags.filter(pt => tagIdsToRemove.has(pt.tag_id));
    edits.removeTags([...tagIdsToRemove]);

    try {
      // Note: Child tags and publication_tags will be deleted via CASCADE
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagId);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      // Rollback optimistic update on error
      edits.addTags(removedTags);
      edits.addPublicationTagLinks(removedLinks);

      toast({
        title: 'error_deleting_tag',
        description: (error as Error).message,
        variant: 'destructive', feedbackSeverity: 'error',
      });

      return { success: false, error: error as Error };
    }
  }, [userId, canEdit, tags, publicationTags, edits, toast]);

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

    // Get existing tag associations for this publication
    const existingTagIds = publicationTags
      .filter(pt => pt.vault_publication_id === publicationId || pt.publication_id === publicationId)
      .map(pt => pt.tag_id);

    // Calculate tags to add and remove
    const tagsToAdd = newTagIds.filter(id => !existingTagIds.includes(id));
    const tagsToRemove = existingTagIds.filter(id => !newTagIds.includes(id));
    const removedLinks = publicationTags.filter(pt =>
      (pt.vault_publication_id === publicationId || pt.publication_id === publicationId) &&
      tagsToRemove.includes(pt.tag_id));
    const tempLinks = tagsToAdd.map(tagId => ({
      id: `temp_${operationId}_${tagId}`,
      publication_id: null,
      vault_publication_id: publicationId,
      tag_id: tagId,
    })) as PublicationTag[];

    // Apply optimistic update
    edits.removePublicationTagLinks(removedLinks.map(link => link.id));
    edits.addPublicationTagLinks(tempLinks);

    try {
      // Validate that all tag IDs belong to this vault, or are one of the
      // signed-in user's own personal (vault_id IS NULL) tags -- VaultContentContext's
      // `tags` now surfaces both kinds (issue #233), so a paper that already
      // carries a personal tag must still pass this check on any edit that
      // resubmits the full tag set, not just the vault-scoped ones being
      // added/removed.
      if (newTagIds.length > 0) {
        const [vaultScopedRes, userScopedRes] = await Promise.all([
          supabase.from('tags').select('id').in('id', newTagIds).eq('vault_id', vaultId),
          supabase.from('tags').select('id').in('id', newTagIds).eq('user_id', userId).is('vault_id', null),
        ]);
        if (vaultScopedRes.error) throw vaultScopedRes.error;
        if (userScopedRes.error) throw userScopedRes.error;

        const validTagIds = new Set([
          ...(vaultScopedRes.data?.map(tag => tag.id) || []),
          ...(userScopedRes.data?.map(tag => tag.id) || []),
        ]);
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
          edits.removePublicationTagLinks(tempLinks.map(link => link.id));
          edits.addPublicationTagLinks(insertedTags as PublicationTag[]);
        }
      }

      if (!options.silent) {
        toast({ title: 'tags_updated ✨' });
      }

      return { success: true };
    } catch (error) {
      // Rollback optimistic update on error
      edits.removePublicationTagLinks(tempLinks.map(link => link.id));
      edits.addPublicationTagLinks(removedLinks);

      if (!options.silent) {
        toast({
          title: 'error_updating_tags',
          description: (error as Error).message,
          variant: 'destructive', feedbackSeverity: 'error',
        });
      }

      return { success: false, error: error as Error };
    }
  }, [vaultId, userId, canEdit, publicationTags, edits, toast]);

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

    // The placeholder goes through the same mapping as the row that replaces it.
    const now = new Date().toISOString();
    const optimisticPublication = formatVaultPublication({
      ...data,
      id: tempId,
      created_by: userId,
      title: data.title || '',
      created_at: now,
      updated_at: now,
    });

    // Apply optimistic update
    edits.addPublication(optimisticPublication);

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
          // data.title is optional (Partial<Publication>), but the insert
          // above already succeeded against publications' NOT NULL title,
          // so newPub.title is the authoritative, guaranteed-present value.
          title: newPub.title,
          created_by: userId,
        })
        .select()
        .single();

      if (vaultPubError) throw vaultPubError;

      // The full row, including original_publication_id and the section/featured fields. A
      // hand-built copy used to drop them, so the first edit in the same session found no
      // canonical id and skipped updating the canonical copy.
      const finalPublication = formatVaultPublication(vaultPub);

      // Replace temporary publication with real one
      // Also filter out any duplicates that might have been added by realtime
      edits.replacePublication(tempId, finalPublication);

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
        edits.addPublicationTagLinks(tagIds.map(tagId => ({
          id: `${vaultPub.id}_${tagId}`,
          publication_id: null,
          vault_publication_id: vaultPub.id,
          tag_id: tagId,
        })) as PublicationTag[]);
      }

      toast({ title: 'paper_added ✨' });

      return { success: true, publication: finalPublication };
    } catch (error) {
      // Rollback optimistic update on error
      edits.removePublications([tempId]);

      toast({
        title: 'error_creating_paper',
        description: (error as Error).message,
        variant: 'destructive', feedbackSeverity: 'error',
      });

      return { success: false, error: error as Error };
    }
  }, [vaultId, userId, canEdit, edits, toast]);

  /**
   * Delete a publication from the vault with optimistic update
   */
  const deleteVaultPublication = useCallback(async (
    publicationId: string
  ): Promise<{ success: boolean; error?: Error }> => {
    if (!vaultId || !userId || !canEdit) {
      return { success: false, error: new Error('Not authorized to delete publications') };
    }

    const removedPublication = publications.find(pub => pub.id === publicationId);
    const removedLinks = publicationTags.filter(pt =>
      pt.vault_publication_id === publicationId || pt.publication_id === publicationId);

    // Apply optimistic update
    edits.removePublications([publicationId]);

    try {
      const { error } = await supabase
        .from('vault_publications')
        .delete()
        .eq('id', publicationId);

      if (error) throw error;

      toast({ title: 'paper_removed ✨' });

      return { success: true };
    } catch (error) {
      // Rollback optimistic update on error
      if (removedPublication) edits.addPublication(removedPublication);
      edits.addPublicationTagLinks(removedLinks);

      toast({
        title: 'error_deleting_paper',
        description: (error as Error).message,
        variant: 'destructive', feedbackSeverity: 'error',
      });

      return { success: false, error: error as Error };
    }
  }, [vaultId, userId, canEdit, publications, publicationTags, edits, toast]);

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
  };
}
