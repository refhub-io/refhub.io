import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Plus, X } from 'lucide-react';
import { FilterBuilder, applyFilters, type PublicationFilter } from '@/components/publications/FilterBuilder';
import type { Publication, Tag, Vault, SmartCollection } from '@/types/database';
import type { SmartCollectionInput } from '@/lib/smartCollections';

// Matches VaultDialog's VAULT_COLORS palette so any "assign a color to this"
// picker in the app offers the same swatches.
const COLLECTION_COLORS = [
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
];

interface SmartCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCollection: SmartCollection | null;
  allPublications: Publication[];
  tags: Tag[];
  vaults: Vault[];
  publicationTagsMap: Record<string, string[]>;
  publicationVaultsMap: Record<string, string[]>;
  onSave: (input: SmartCollectionInput) => Promise<unknown>;
}

export function SmartCollectionDialog({
  open,
  onOpenChange,
  editingCollection,
  allPublications,
  tags,
  vaults,
  publicationTagsMap,
  publicationVaultsMap,
  onSave,
}: SmartCollectionDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(COLLECTION_COLORS[0]);
  const [filters, setFilters] = useState<PublicationFilter[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editingCollection?.name ?? '');
      setColor(editingCollection?.color ?? COLLECTION_COLORS[0]);
      setFilters(editingCollection?.filters ?? []);
    }
  }, [open, editingCollection]);

  const matchCount = useMemo(
    () => applyFilters(allPublications, filters, publicationTagsMap, publicationVaultsMap).length,
    [allPublications, filters, publicationTagsMap, publicationVaultsMap],
  );

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), color, filters });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-bold font-mono">
            {editingCollection ? 'edit_smart_collection' : 'new_smart_collection'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="smart-collection-name" className="font-semibold font-mono">name</Label>
            <Input
              id="smart-collection-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g._unread_visual_storytelling_papers"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-semibold font-mono">color</Label>
            <div className="flex gap-2">
              {COLLECTION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use color ${c}`}
                  className={`w-8 h-8 rounded-lg transition-all duration-200 shadow-md ${
                    color === c ? 'ring-2 ring-offset-2 ring-offset-background ring-white scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c, boxShadow: color === c ? `0 0 20px ${c}50` : undefined }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-semibold font-mono">rules</Label>
            <FilterBuilder filters={filters} onFiltersChange={setFilters} tags={tags} vaults={vaults} />
          </div>

          <p className="text-sm text-muted-foreground font-mono">
            {matchCount} {matchCount === 1 ? 'paper matches' : 'papers match'}
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-border w-full box-border">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="font-mono w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10"
          >
            <X className="w-3 h-3 mr-1.5" />
            cancel
          </Button>
          <Button
            type="button"
            variant="glow"
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="font-mono w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10"
          >
            {saving ? (
              'saving...'
            ) : editingCollection ? (
              <><Save className="w-3 h-3 mr-1.5" />save_changes</>
            ) : (
              <><Plus className="w-3 h-3 mr-1.5" />create_collection</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
