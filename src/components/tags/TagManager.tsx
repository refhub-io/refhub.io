import { useState, useRef, useEffect } from 'react';
import { Tag } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  buildTagTree, 
  flattenTagTree, 
  getHierarchicalColor 
} from '@/lib/tagHierarchy';
import { 
  Pencil, 
  Trash2, 
  ChevronRight,
  Tags,
  Plus,
  Check,
  X,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const TAG_COLORS = [
  '#a855f7', '#ec4899', '#f43f5e', '#22c55e', '#06b6d4',
  '#3b82f6', '#f97316', '#eab308', '#14b8a6', '#8b5cf6',
  '#d946ef', '#6366f1', '#0ea5e9', '#84cc16', '#ef4444',
  '#f59e0b',
];

interface TagManagerProps {
  tags: Tag[];
  canEdit: boolean;
  onUpdateTag: (tagId: string, updates: Partial<Tag>) => Promise<Tag | null>;
  onDeleteTag: (tagId: string) => Promise<{ success: boolean; error?: Error }>;
  onCreateTag?: (name: string, parentId?: string) => Promise<Tag | null>;
  tagUsageCounts?: Map<string, number>;
}

export function TagManager({
  tags,
  canEdit,
  onUpdateTag,
  onDeleteTag,
  onCreateTag,
  tagUsageCounts,
}: TagManagerProps) {
  // Inline edit state
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Delete confirm state
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);

  // Inline add state
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const [newParentId, setNewParentId] = useState<string>('none');
  const addInputRef = useRef<HTMLInputElement>(null);

  const [isProcessing, setIsProcessing] = useState(false);

  const tree = buildTagTree(tags);
  const flattenedTags = flattenTagTree(tree);

  // Auto-focus when editing starts
  useEffect(() => {
    if (editingTagId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTagId]);

  useEffect(() => {
    if (isAdding && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [isAdding]);

  const handleStartEdit = (tag: Tag) => {
    setEditingTagId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const handleCancelEdit = () => {
    setEditingTagId(null);
    setEditName('');
    setEditColor('');
  };

  const handleSaveEdit = async () => {
    if (!editingTagId || isProcessing) return;
    const tag = tags.find(t => t.id === editingTagId);
    if (!tag) return;

    const updates: Partial<Tag> = {};
    if (editName.trim() && editName.trim() !== tag.name) {
      updates.name = editName.trim();
    }
    if (editColor && editColor !== tag.color) {
      updates.color = editColor;
    }
    if (Object.keys(updates).length === 0) {
      handleCancelEdit();
      return;
    }

    setIsProcessing(true);
    const result = await onUpdateTag(editingTagId, updates);
    setIsProcessing(false);

    if (result) {
      handleCancelEdit();
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTag || isProcessing) return;

    setIsProcessing(true);
    const result = await onDeleteTag(deletingTag.id);
    setIsProcessing(false);

    if (result.success) {
      setDeletingTag(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || isProcessing || !onCreateTag) return;

    setIsProcessing(true);
    const parentId = newParentId === 'none' ? undefined : newParentId;
    const tag = await onCreateTag(newName.trim(), parentId);
    setIsProcessing(false);

    if (tag) {
      // If we created with a custom color that differs from default, update it
      if (newColor !== tag.color) {
        await onUpdateTag(tag.id, { color: newColor });
      }
      setNewName('');
      setNewColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]);
      setNewParentId('none');
      // Keep add row open for rapid entry
    }
  };

  // Count child tags that will be deleted
  const getChildTagCount = (tagId: string): number => {
    return tags.filter(t => {
      let current = t;
      while (current.parent_id) {
        if (current.parent_id === tagId) return true;
        current = tags.find(p => p.id === current.parent_id) || current;
        if (current.parent_id === current.id) break;
      }
      return false;
    }).length;
  };

  return (
    <div className="space-y-2">
      {/* Tag count header */}
      {flattenedTags.length > 0 && (
        <div className="flex items-center justify-between px-1 pb-1">
          <p className="text-xs text-muted-foreground font-mono">
            {flattenedTags.length} tag{flattenedTags.length !== 1 ? 's' : ''}
          </p>
          {canEdit && onCreateTag && !isAdding && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              add
            </Button>
          )}
        </div>
      )}

      {/* Tag list */}
      {flattenedTags.length === 0 && !isAdding && (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
            <Tags className="w-6 h-6 opacity-50" />
          </div>
          <p className="font-mono text-sm">// no_tags_yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first tag to organize papers</p>
          {canEdit && onCreateTag && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 font-mono text-xs"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              create_tag()
            </Button>
          )}
        </div>
      )}

      <div className="space-y-0.5">
        {flattenedTags.map(tag => {
          const usageCount = tagUsageCounts?.get(tag.id) ?? 0;
          const tagColor = getHierarchicalColor(tag, tags);
          const isEditing = editingTagId === tag.id;

          if (isEditing) {
            return (
              <div
                key={tag.id}
                className="flex items-center gap-2 py-2 px-3 rounded-lg bg-primary/5 border border-primary/20 ring-1 ring-primary/10"
                style={{ paddingLeft: `${12 + tag.depth * 20}px` }}
              >
                {tag.depth > 0 && (
                  <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                )}
                <ColorPicker color={editColor} onChange={setEditColor} />
                <Input
                  ref={editInputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 font-mono text-sm flex-1 min-w-0"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEdit();
                    }
                    if (e.key === 'Escape') {
                      handleCancelEdit();
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                  onClick={handleSaveEdit}
                  disabled={isProcessing}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={handleCancelEdit}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            );
          }

          return (
            <div
              key={tag.id}
              className={cn(
                'group flex items-center justify-between py-2 px-3 rounded-lg',
                'hover:bg-muted/60 transition-all duration-150'
              )}
              style={{ paddingLeft: `${12 + tag.depth * 20}px` }}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {tag.depth > 0 && (
                  <ChevronRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                )}
                <div
                  className="w-3 h-3 rounded-md shrink-0 ring-1 ring-black/10 dark:ring-white/10"
                  style={{ backgroundColor: tagColor }}
                />
                <span className="font-mono text-sm truncate">
                  {tag.name}
                </span>
                {usageCount > 0 && (
                  <span className="text-[11px] text-muted-foreground font-mono tabular-nums bg-muted/80 px-1.5 py-0.5 rounded-md">
                    {usageCount}
                  </span>
                )}
              </div>

              {canEdit && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => handleStartEdit(tag)}
                    title="Edit tag"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeletingTag(tag)}
                    title="Delete tag"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          );
      })}
      </div>

      {/* Inline add row */}
      {canEdit && onCreateTag && isAdding && (
        <div className="mt-3 p-3 rounded-lg border-2 border-dashed border-primary/20 bg-primary/5 space-y-2.5">
          <div className="flex items-center gap-2">
            <ColorPicker color={newColor} onChange={setNewColor} />
            <Input
              ref={addInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="tag_name"
              className="h-8 font-mono text-sm flex-1 min-w-0"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
                if (e.key === 'Escape') {
                  setIsAdding(false);
                  setNewName('');
                }
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10"
              onClick={handleCreate}
              disabled={!newName.trim() || isProcessing}
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => { setIsAdding(false); setNewName(''); }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <Select value={newParentId} onValueChange={setNewParentId}>
            <SelectTrigger className="h-8 text-xs font-mono">
              <SelectValue placeholder="Parent tag (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">No parent (root level)</span>
              </SelectItem>
              {flattenedTags.map(tag => (
                <SelectItem key={tag.id} value={tag.id}>
                  <div className="flex items-center gap-1">
                    {'—'.repeat(tag.depth)}
                    <span
                      className="w-2 h-2 rounded-md ml-1"
                      style={{ backgroundColor: getHierarchicalColor(tag, tags) }}
                    />
                    <span className="font-mono">{tag.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground font-mono px-0.5">
            // press enter to create • escape to cancel
          </p>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingTag} onOpenChange={(open) => !open && setDeletingTag(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">delete_tag()</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Are you sure you want to delete <span className="font-mono font-semibold">#{deletingTag?.name}</span>?
                </p>
                {deletingTag && getChildTagCount(deletingTag.id) > 0 && (
                  <p className="text-amber-600 dark:text-amber-400">
                    This will also delete {getChildTagCount(deletingTag.id)} child tag{getChildTagCount(deletingTag.id) > 1 ? 's' : ''}.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Publications will be untagged but not deleted.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>cancel()</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? 'deleting...' : 'delete()'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Color Picker control ────────────────────────────────────────────────────

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-7 h-7 rounded-md border-2 border-border shrink-0 hover:ring-2 hover:ring-ring hover:ring-offset-1 hover:ring-offset-background transition-all shadow-sm"
          style={{ backgroundColor: color }}
          title="Pick color"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start" sideOffset={8}>
        <p className="text-[11px] text-muted-foreground font-mono mb-2">// pick_color</p>
        <div className="grid grid-cols-8 gap-1.5">
          {TAG_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={cn(
                'w-6 h-6 rounded-md border transition-all hover:scale-110',
                c === color ? 'ring-2 ring-ring ring-offset-1 ring-offset-background' : 'border-transparent'
              )}
              style={{ backgroundColor: c }}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
          <input
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            className="w-6 h-6 rounded cursor-pointer border-0 p-0"
          />
          <Input
            value={color}
            onChange={(e) => {
              if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value) || e.target.value === '') {
                onChange(e.target.value);
              }
            }}
            className="h-7 font-mono text-xs flex-1"
            placeholder="#000000"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
