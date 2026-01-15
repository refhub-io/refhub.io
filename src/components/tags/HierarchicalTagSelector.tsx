import { useState } from 'react';
import { Tag } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  buildTagTree, 
  flattenTagTree, 
  getHierarchicalColor,
  HierarchicalTag 
} from '@/lib/tagHierarchy';
import { HierarchicalTagBadge } from './HierarchicalTagBadge';
import { Hash, Plus, X, ChevronRight } from 'lucide-react';

interface HierarchicalTagSelectorProps {
  tags: Tag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string, parentId?: string) => Promise<Tag | null>;
}

export function HierarchicalTagSelector({
  tags,
  selectedTagIds,
  onToggleTag,
  onCreateTag,
}: HierarchicalTagSelectorProps) {
  const [newTagName, setNewTagName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string>('none');
  const [isCreating, setIsCreating] = useState(false);

  const tree = buildTagTree(tags);
  const flattenedTags = flattenTagTree(tree);

  const handleCreateTag = async () => {
    if (!newTagName.trim() || isCreating) return;
    
    setIsCreating(true);
    const parentId = selectedParentId === 'none' ? undefined : selectedParentId;
    const tag = await onCreateTag(newTagName.trim(), parentId);
    
    if (tag) {
      onToggleTag(tag.id);
      setNewTagName('');
      setSelectedParentId('none');
    }
    setIsCreating(false);
  };

  // Group tags by root parent for visual organization
  const renderTagGroup = (rootTags: HierarchicalTag[]) => {
    return rootTags.map(rootTag => {
      const descendants = flattenedTags.filter(
        t => t.parentChain?.some(p => p.id === rootTag.id) || t.id === rootTag.id
      );
      
      return (
        <div key={rootTag.id} className="space-y-1.5">
          {descendants.map(tag => (
            <div 
              key={tag.id} 
              className="flex items-center"
              style={{ paddingLeft: `${tag.depth * 12}px` }}
            >
              {tag.depth > 0 && (
                <ChevronRight className="w-3 h-3 text-muted-foreground mr-1 shrink-0" />
              )}
              <HierarchicalTagBadge
                tag={tag}
                allTags={tags}
                isSelected={selectedTagIds.includes(tag.id)}
                onClick={() => onToggleTag(tag.id)}
                showHierarchy={false}
              />
            </div>
          ))}
        </div>
      );
    });
  };

  return (
    <div className="space-y-4 min-w-0">
      <Label className="font-semibold">Tags</Label>
      
      {/* Selected tags display */}
      {selectedTagIds.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border border-border min-w-0 overflow-x-auto">
          {selectedTagIds.map(tagId => {
            const tag = tags.find(t => t.id === tagId);
            if (!tag) return null;
            return (
              <HierarchicalTagBadge
                key={tag.id}
                tag={tag}
                allTags={tags}
                isSelected
                onClick={() => onToggleTag(tag.id)}
                showHierarchy
              />
            );
          })}
        </div>
      )}
      
      {/* Tag tree selection */}
      <div className="space-y-3 max-h-48 overflow-y-auto p-2 bg-card/50 rounded-lg border border-border min-w-0 overflow-x-hidden">
        {tree.length === 0 ? (
          <p className="text-sm text-muted-foreground font-mono text-center py-4">
            // no tags yet
          </p>
        ) : (
          renderTagGroup(tree)
        )}
      </div>
      
      {/* Create new tag */}
      <div className="space-y-2 min-w-0">
        <div className="flex gap-2 min-w-0">
          <Input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="new_tag_name"
            className="flex-1 font-mono text-sm min-w-0"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreateTag();
              }
            }}
          />
          <Button 
            type="button" 
            variant="outline" 
            size="icon" 
            onClick={handleCreateTag}
            disabled={!newTagName.trim() || isCreating}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        
        <Select value={selectedParentId} onValueChange={setSelectedParentId}>
          <SelectTrigger className="text-sm">
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
                    className="w-2 h-2 rounded-full ml-1"
                    style={{ backgroundColor: getHierarchicalColor(tag, tags) }}
                  />
                  <span className="font-mono">{tag.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
