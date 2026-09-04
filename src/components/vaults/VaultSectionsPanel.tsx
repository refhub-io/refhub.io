import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVaultSections } from '@/hooks/useVaultSections';
import { updateVaultPublicationSection } from '@/lib/vaultSections';
import { showError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ChevronUp, ChevronDown, Star, Eye, Layers } from 'lucide-react';
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
  const [previewOpen, setPreviewOpen] = useState(false);

  // Same grouping shape visitors will see in PublicVaultSectionsView, plus an
  // "unsectioned" bucket — lets an owner see at a glance what's organized vs.
  // still needs sorting, instead of one flat list of every paper in the vault.
  const groups = useMemo(() => {
    const bySection = sections
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((section) => ({
        section,
        papers: publications
          .filter((p) => p.section_id === section.id)
          .sort((a, b) => (a.section_position ?? 0) - (b.section_position ?? 0)),
      }));
    const unsectioned = publications.filter((p) => !p.section_id || !sections.some((s) => s.id === p.section_id));
    return { bySection, unsectioned };
  }, [sections, publications]);

  const curatedCount = useMemo(
    () => groups.bySection.reduce((sum, g) => sum + g.papers.length, 0),
    [groups],
  );

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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground font-mono">// sections</p>
          {sections.length > 0 && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {curatedCount} of {publications.length} papers curated
            </Badge>
          )}
        </div>
        {sections.length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="h-7 font-mono text-xs" onClick={() => setPreviewOpen((o) => !o)}>
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            {previewOpen ? 'hide preview' : 'preview'}
          </Button>
        )}
      </div>

      {previewOpen && sections.length > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wide">how visitors will see this</p>
          {groups.bySection.filter((g) => g.papers.length > 0).length === 0 ? (
            <p className="text-xs text-muted-foreground font-mono">// no papers assigned yet — the curated view will show nothing until you assign at least one</p>
          ) : (
            groups.bySection.filter((g) => g.papers.length > 0).map(({ section, papers }) => (
              <div key={section.id}>
                <p className="text-sm font-bold font-mono">{section.name}</p>
                {section.description && <p className="text-xs text-muted-foreground font-mono">{section.description}</p>}
                <ul className="mt-1 space-y-0.5">
                  {papers.map((p) => (
                    <li key={p.id} className="text-xs font-mono text-muted-foreground truncate">
                      {p.featured && <span className="text-primary">★ </span>}
                      {p.title}
                      {p.featured && p.featured_note && <span className="text-primary/80"> — {p.featured_note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {sections.length === 0 && (
        <p className="text-xs text-muted-foreground font-mono py-2">
          // no sections yet — add one below to start curating this vault's public page
        </p>
      )}

      <div className="space-y-3">
        {sections.map((section, index) => {
          const count = publications.filter((p) => p.section_id === section.id).length;
          return (
            <div key={section.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={section.name}
                  onChange={(e) => void renameSection(section.id, { name: e.target.value })}
                  className="font-mono text-sm h-8"
                />
                <Badge variant="outline" className="font-mono text-[10px] shrink-0">{count}</Badge>
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
          );
        })}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
        <Input placeholder="section name" value={newName} onChange={(e) => setNewName(e.target.value)} className="font-mono text-sm h-8" />
        <Textarea placeholder="optional description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="font-mono text-xs min-h-[2.5rem]" />
        <Button type="button" variant="outline" size="sm" onClick={() => void handleAddSection()} className="font-mono self-start">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          add section
        </Button>
      </div>

      <div className="space-y-4">
        <p className="text-xs text-muted-foreground font-mono">// assign papers</p>

        {publications.length === 0 && (
          <p className="text-xs text-muted-foreground font-mono py-2">// this vault has no papers yet</p>
        )}

        {groups.bySection.map(({ section, papers }) => (
          papers.length > 0 && (
            <div key={section.id} className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground/70 font-mono uppercase tracking-wide">{section.name} ({papers.length})</p>
              {papers.map((pub) => (
                <AssignRow
                  key={pub.id}
                  pub={pub}
                  sections={sections}
                  publications={publications}
                  onAssign={handleAssign}
                  onMove={movePublicationInSection}
                  onPatch={patchPublication}
                />
              ))}
            </div>
          )
        ))}

        {groups.unsectioned.length > 0 && (
          <div className="space-y-1.5">
            {sections.length > 0 && (
              <p className="text-[10px] text-muted-foreground/70 font-mono uppercase tracking-wide">unsectioned ({groups.unsectioned.length})</p>
            )}
            {groups.unsectioned.map((pub) => (
              <AssignRow
                key={pub.id}
                pub={pub}
                sections={sections}
                publications={publications}
                onAssign={handleAssign}
                onMove={movePublicationInSection}
                onPatch={patchPublication}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AssignRowProps {
  pub: Publication;
  sections: ReturnType<typeof useVaultSections>['sections'];
  publications: Publication[];
  onAssign: (pubId: string, sectionId: string) => void;
  onMove: (pub: Publication) => ((direction: -1 | 1) => void) | undefined;
  onPatch: (pubId: string, patch: Parameters<typeof updateVaultPublicationSection>[2]) => Promise<void>;
}

function AssignRow({ pub, sections, publications, onAssign, onMove, onPatch }: AssignRowProps) {
  const siblings = publications
    .filter((p) => p.section_id === pub.section_id)
    .sort((a, b) => (a.section_position ?? 0) - (b.section_position ?? 0));
  const isFirst = siblings[0]?.id === pub.id;
  const isLast = siblings.at(-1)?.id === pub.id;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-2">
      <span className="flex-1 text-sm font-medium truncate">{pub.title}</span>
      <label className="sr-only" htmlFor={`section-select-${pub.id}`}>{`section for ${pub.title}`}</label>
      <select
        id={`section-select-${pub.id}`}
        value={pub.section_id ?? ''}
        onChange={(e) => onAssign(pub.id, e.target.value)}
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
            onClick={() => onMove(pub)?.(-1)}
            aria-label={`move ${pub.title} up within section`}
            disabled={isFirst}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onMove(pub)?.(1)}
            aria-label={`move ${pub.title} down within section`}
            disabled={isLast}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          <button
            type="button"
            aria-label={`feature ${pub.title}`}
            onClick={() => void onPatch(pub.id, { featured: !pub.featured })}
            className={pub.featured ? 'text-primary' : 'text-muted-foreground'}
          >
            <Star className="w-4 h-4" fill={pub.featured ? 'currentColor' : 'none'} />
          </button>
          {pub.featured && (
            <Input
              placeholder="curator note (optional)"
              value={pub.featured_note ?? ''}
              onChange={(e) => void onPatch(pub.id, { featured_note: e.target.value || null })}
              className="font-mono text-xs h-8 w-40"
            />
          )}
        </>
      )}
    </div>
  );
}
