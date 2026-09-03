import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';
import type { VaultSection } from '@/types/database';
import {
  fetchVaultSections,
  createVaultSection,
  updateVaultSection,
  deleteVaultSection,
  reorderVaultSections,
  type VaultSectionInput,
} from '@/lib/vaultSections';

export function useVaultSections(vaultId: string | null) {
  const { toast } = useToast();
  const [sections, setSections] = useState<VaultSection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!vaultId) {
      setSections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchVaultSections(supabase, vaultId);
      setSections(data);
    } catch (error) {
      toast({ title: 'Could not load sections', description: (error as Error).message, variant: 'destructive', feedbackSeverity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [vaultId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const createSection = useCallback(
    async (input: { name: string; description: string | null }): Promise<VaultSection | null> => {
      if (!vaultId) return null;
      try {
        const created = await createVaultSection(supabase, vaultId, { ...input, position: sections.length });
        setSections((prev) => [...prev, created]);
        toast({ title: 'Section created', source: null });
        return created;
      } catch (error) {
        toast({ title: 'Could not create section', description: (error as Error).message, variant: 'destructive', feedbackSeverity: 'error' });
        return null;
      }
    },
    [vaultId, sections.length, toast],
  );

  const renameSection = useCallback(
    async (sectionId: string, patch: Partial<VaultSectionInput>): Promise<void> => {
      try {
        const updated = await updateVaultSection(supabase, sectionId, patch);
        setSections((prev) => prev.map((s) => (s.id === sectionId ? updated : s)));
      } catch (error) {
        toast({ title: 'Could not update section', description: (error as Error).message, variant: 'destructive', feedbackSeverity: 'error' });
      }
    },
    [toast],
  );

  const deleteSection = useCallback(
    async (sectionId: string): Promise<void> => {
      try {
        await deleteVaultSection(supabase, sectionId);
        setSections((prev) => prev.filter((s) => s.id !== sectionId));
        toast({ title: 'Section deleted', source: null });
      } catch (error) {
        toast({ title: 'Could not delete section', description: (error as Error).message, variant: 'destructive', feedbackSeverity: 'error' });
      }
    },
    [toast],
  );

  const reorderSections = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      const previous = sections;
      setSections(orderedIds.map((id, i) => {
        const found = previous.find((s) => s.id === id);
        return found ? { ...found, position: i } : found;
      }).filter((s): s is VaultSection => Boolean(s)));
      try {
        await reorderVaultSections(supabase, orderedIds);
      } catch (error) {
        setSections(previous);
        toast({ title: 'Could not reorder sections', description: (error as Error).message, variant: 'destructive', feedbackSeverity: 'error' });
      }
    },
    [sections, toast],
  );

  return { sections, loading, createSection, renameSection, deleteSection, reorderSections, refresh: load };
}
