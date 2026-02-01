import { useState } from 'react';
import { Tag } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  MoreHorizontal, 
  Pencil, 
  Trash2, 
  ChevronRight,
  Tags,
  Hash
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagManagerProps {
  tags: Tag[];
  canEdit: boolean;
  onUpdateTag: (tagId: string, updates: Partial<Tag>) => Promise<Tag | null>;
  onDeleteTag: (tagId: string) => Promise<{ success: boolean; error?: Error }>;
  // Optional: count of publications using each tag
  tagUsageCounts?: Map<string, number>;
}

export function TagManager({
  tags,
  canEdit,
  onUpdateTag,
  onDeleteTag,
  tagUsageCounts,
}: TagManagerProps) {
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const tree = buildTagTree(tags);
  const flattenedTags = flattenTagTree(tree);

  const handleStartEdit = (tag: Tag) => {
    setEditingTag(tag);
    setEditName(tag.name);
  };

  const handleSaveEdit = async () => {
    if (!editingTag || !editName.trim() || isProcessing) return;
    
    setIsProcessing(true);
    const result = await onUpdateTag(editingTag.id, { name: editName.trim() });
    setIsProcessing(false);
    
    if (result) {
      setEditingTag(null);
      setEditName('');
    }
  };

  const handleStartDelete = (tag: Tag) => {
    setDeletingTag(tag);
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

  // Count child tags that will be deleted
  const getChildTagCount = (tagId: string): number => {
    return tags.filter(t => {
      let current = t;
      while (current.parent_id) {
        if (current.parent_id === tagId) return true;
        current = tags.find(p => p.id === current.parent_id) || current;
        if (current.parent_id === current.id) break; // Prevent infinite loop
      }
      return false;
    }).length;
  };

  if (tags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Tags className="w-8 h-8 mb-2 opacity-50" />
        <p className="font-mono text-sm">// no tags in this vault</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {flattenedTags.map(tag => {
        const usageCount = tagUsageCounts?.get(tag.id) ?? 0;
        const childCount = getChildTagCount(tag.id);
        const tagColor = getHierarchicalColor(tag, tags);

        return (
          <div 
            key={tag.id} 
            className={cn(
              "group flex items-center justify-between py-1.5 px-2 rounded-md",
              "hover:bg-muted/50 transition-colors"
            )}
            style={{ paddingLeft: `${8 + tag.depth * 16}px` }}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {tag.depth > 0 && (
                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
              )}
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: tagColor }}
              />
              <span className="font-mono text-sm truncate flex items-center gap-1">
                <Hash className="w-3 h-3 text-muted-foreground" />
                {tag.name}
              </span>
              {usageCount > 0 && (
                <span className="text-xs text-muted-foreground font-mono">
                  ({usageCount})
                </span>
              )}
            </div>

            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                    <span className="sr-only">Tag actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="font-mono">
                  <DropdownMenuItem onClick={() => handleStartEdit(tag)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    rename()
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => handleStartDelete(tag)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    delete()
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}

      {/* Edit Tag Dialog */}
      <Dialog open={!!editingTag} onOpenChange={(open) => !open && setEditingTag(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">rename_tag()</DialogTitle>
            <DialogDescription>
              Enter a new name for this tag.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-muted-foreground" />
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="tag_name"
                className="font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveEdit();
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingTag(null)}
              disabled={isProcessing}
            >
              cancel()
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editName.trim() || editName === editingTag?.name || isProcessing}
            >
              {isProcessing ? 'saving...' : 'save()'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    ⚠️ This will also delete {getChildTagCount(deletingTag.id)} child tag{getChildTagCount(deletingTag.id) > 1 ? 's' : ''}.
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
