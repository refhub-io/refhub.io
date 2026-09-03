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
import { FilterBuilder, applyFilters, type PublicationFilter } from '@/components/publications/FilterBuilder';
import type { Publication, Tag, Vault, SmartCollection } from '@/types/database';
import type { SmartCollectionInput } from '@/lib/smartCollections';

const COLLECTION_COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

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
          <DialogTitle className="font-mono">
            {editingCollection ? 'edit_smart_collection' : 'new_smart_collection'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="smart-collection-name">Name</Label>
            <Input
              id="smart-collection-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Unread visual storytelling papers"
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLLECTION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use color ${c}`}
                  className="w-6 h-6 rounded-full border-2"
                  style={{ backgroundColor: c, borderColor: c === color ? 'white' : 'transparent' }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Rules</Label>
            <FilterBuilder filters={filters} onFiltersChange={setFilters} tags={tags} vaults={vaults} />
          </div>

          <p className="text-sm text-muted-foreground font-mono">
            {matchCount} {matchCount === 1 ? 'paper matches' : 'papers match'}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
