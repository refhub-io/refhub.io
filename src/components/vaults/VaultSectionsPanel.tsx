import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVaultSections } from '@/hooks/useVaultSections';
import { updateVaultPublicationSection } from '@/lib/vaultSections';
import { showError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ChevronUp, ChevronDown, Star } from 'lucide-react';
import type { Publication } from '@/types/database';

interface VaultSectionsPanelProps {
  vaultId: string;
  publications: Publication[];
  onPublicationsChange: (next: Publication[]) => void;
}

export function VaultSectionsPanel({ vaultId, publications, onPublicationsChange }: VaultSectionsPanelProps) {
  const { sections, loading, createSection, renameSection, deleteSection, reorderSections } = useVaultSections(vaultId);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const patchPublication = async (pubId: string, patch: Parameters<typeof updateVaultPublicationSection>[2]) => {
    const updated = publications.map((p) => (p.id === pubId ? { ...p, ...patch } : p));
    onPublicationsChange(updated);
    try {
      await updateVaultPublicationSection(supabase, pubId, patch);
    } catch (error) {
      showError('Failed to save publication', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleAddSection = async () => {
    if (!newName.trim()) return;
    const created = await createSection({ name: newName.trim(), description: newDescription.trim() || null });
    if (created) {
      setNewName('');
      setNewDescription('');
    }
  };

  const handleAssign = (pubId: string, sectionId: string) => {
    const sectionPubs = publications.filter((p) => p.section_id === sectionId);
    void patchPublication(pubId, {
      section_id: sectionId || null,
      section_position: sectionId ? sectionPubs.length : 0,
    });
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sections.length) return;
    const reordered = sections.map((s) => s.id);
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    void reorderSections(reordered);
  };

  const swapSectionPositions = async (a: Publication, b: Publication) => {
    const updated = publications.map((p) => {
      if (p.id === a.id) return { ...p, section_position: b.section_position ?? 0 };
      if (p.id === b.id) return { ...p, section_position: a.section_position ?? 0 };
      return p;
    });
    onPublicationsChange(updated);
    try {
      await Promise.all([
        updateVaultPublicationSection(supabase, a.id, { section_position: b.section_position ?? 0 }),
        updateVaultPublicationSection(supabase, b.id, { section_position: a.section_position ?? 0 }),
      ]);
    } catch (error) {
      showError('Failed to reorder', (error as Error).message, { source: null });
    }
  };

  const movePublicationInSection = (pub: Publication) => {
    if (!pub.section_id) return undefined;
    const siblings = publications
      .filter((p) => p.section_id === pub.section_id)
      .sort((a, b) => (a.section_position ?? 0) - (b.section_position ?? 0));
    return (direction: -1 | 1) => {
      const index = siblings.findIndex((p) => p.id === pub.id);
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= siblings.length) return;
      const a = siblings[index];
      const b = siblings[targetIndex];
      void swapSectionPositions(a, b);
    };
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground font-mono py-4">// loading_sections...</p>;
  }

  return (
    <div className="space-y-6 py-4">
      <div className="space-y-3">
        {sections.map((section, index) => (
          <div key={section.id} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={section.name}
                onChange={(e) => void renameSection(section.id, { name: e.target.value })}
                className="font-mono text-sm h-8"
              />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveSection(index, -1)} aria-label={`Move ${section.name} up`}>
                <ChevronUp className="w-3.5 h-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveSection(index, 1)} aria-label={`Move ${section.name} down`}>
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => void deleteSection(section.id)} aria-label={`Delete ${section.name}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <Textarea
              value={section.description ?? ''}
              onChange={(e) => void renameSection(section.id, { description: e.target.value || null })}
              placeholder="optional description"
              className="font-mono text-xs min-h-[2.5rem]"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
        <Input placeholder="section name" value={newName} onChange={(e) => setNewName(e.target.value)} className="font-mono text-sm h-8" />
        <Textarea placeholder="optional description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="font-mono text-xs min-h-[2.5rem]" />
        <Button type="button" variant="outline" size="sm" onClick={() => void handleAddSection()} className="font-mono self-start">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          add section
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-mono">// assign papers</p>
        {publications.map((pub) => (
          <div key={pub.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
            <span className="flex-1 text-sm font-medium truncate">{pub.title}</span>
            <label className="sr-only" htmlFor={`section-select-${pub.id}`}>{`section for ${pub.title}`}</label>
            <select
              id={`section-select-${pub.id}`}
              value={pub.section_id ?? ''}
              onChange={(e) => handleAssign(pub.id, e.target.value)}
              className="text-xs font-mono h-8 rounded-md border border-input bg-background px-2"
            >
              <option value="">unsectioned</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {pub.section_id && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => movePublicationInSection(pub)?.(- 1)}
                  aria-label={`move ${pub.title} up within section`}
                  disabled={publications.filter((p) => p.section_id === pub.section_id).sort((a, b) => (a.section_position ?? 0) - (b.section_position ?? 0))[0]?.id === pub.id}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => movePublicationInSection(pub)?.(1)}
                  aria-label={`move ${pub.title} down within section`}
                  disabled={publications.filter((p) => p.section_id === pub.section_id).sort((a, b) => (a.section_position ?? 0) - (b.section_position ?? 0)).at(-1)?.id === pub.id}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
                <button
                  type="button"
                  aria-label={`feature ${pub.title}`}
                  onClick={() => void patchPublication(pub.id, { featured: !pub.featured })}
                  className={pub.featured ? 'text-primary' : 'text-muted-foreground'}
                >
                  <Star className="w-4 h-4" fill={pub.featured ? 'currentColor' : 'none'} />
                </button>
                {pub.featured && (
                  <Input
                    placeholder="curator note (optional)"
                    value={pub.featured_note ?? ''}
                    onChange={(e) => void patchPublication(pub.id, { featured_note: e.target.value || null })}
                    className="font-mono text-xs h-8 w-40"
                  />
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
