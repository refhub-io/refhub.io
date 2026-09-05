import { useState } from 'react';
import type { InboxItem, Vault, Tag } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertCircle, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface InboxItemCardProps {
  item: InboxItem;
  duplicatePublicationTitle: string | null;
  vaults: Vault[];
  tags: Tag[];
  selectedVaultId: string | null;
  selectedTagIds: string[];
  onVaultChange: (vaultId: string | null) => void;
  onTagsChange: (tagIds: string[]) => void;
  onAccept: () => void;
  onReject: () => void;
  onMerge: () => void;
  onPostpone: () => void;
  focused: boolean;
}

export function InboxItemCard(props: InboxItemCardProps): JSX.Element {
  const {
    item,
    duplicatePublicationTitle,
    vaults,
    tags,
    selectedVaultId,
    selectedTagIds,
    onVaultChange,
    onTagsChange,
    onAccept,
    onReject,
    onMerge,
    onPostpone,
    focused,
  } = props;

  const [isTagsOpen, setIsTagsOpen] = useState(false);

  const title = item.parsed_fields.title || 'Untitled';
  const authors = item.parsed_fields.authors || [];
  const year = item.parsed_fields.year;

  const authorsString = authors.length > 0
    ? authors.length === 1
      ? authors[0]
      : `${authors[0]} et al.`
    : 'Unknown authors';

  const sourceTypeBadgeLabel = item.source_type.toUpperCase();

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));

  const handleTagToggle = (tagId: string) => {
    const newTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    onTagsChange(newTagIds);
  };

  return (
    <Card
      className={`transition-all ${
        focused ? 'ring-2 ring-primary ring-offset-2' : ''
      }`}
    >
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <CardTitle className="text-lg font-semibold line-clamp-2">
                {title}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {authorsString}
                {year && ` • ${year}`}
              </p>
            </div>
            <Badge variant="outline" className="flex-shrink-0">
              {sourceTypeBadgeLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Duplicate banner */}
        {duplicatePublicationTitle && (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-md text-sm">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Duplicate detected
              </p>
              <p className="text-yellow-700 dark:text-yellow-300">
                Matches: <em>{duplicatePublicationTitle}</em>
              </p>
            </div>
          </div>
        )}

        {/* Vault select */}
        <div className="space-y-2">
          <Label htmlFor="vault-select" className="text-sm font-medium">
            Vault
          </Label>
          <Select value={selectedVaultId || ''} onValueChange={(value) => onVaultChange(value || null)}>
            <SelectTrigger id="vault-select">
              <SelectValue placeholder="Select a vault" />
            </SelectTrigger>
            <SelectContent>
              {vaults.map((vault) => (
                <SelectItem key={vault.id} value={vault.id}>
                  {vault.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tag multi-select */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Tags</Label>

          {/* Selected tags display */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-md border border-border">
              {selectedTags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="cursor-pointer group"
                  onClick={() => handleTagToggle(tag.id)}
                >
                  {tag.name}
                  <X className="h-3 w-3 ml-1 group-hover:opacity-100 opacity-70" />
                </Badge>
              ))}
            </div>
          )}

          {/* Tag selector popover */}
          <Popover open={isTagsOpen} onOpenChange={setIsTagsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
              >
                {selectedTags.length === 0
                  ? 'Select tags...'
                  : `${selectedTags.length} tag${selectedTags.length !== 1 ? 's' : ''} selected`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="start">
              <div className="space-y-3">
                {tags.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tags available
                  </p>
                ) : (
                  tags.map((tag) => (
                    <div key={tag.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`tag-${tag.id}`}
                        checked={selectedTagIds.includes(tag.id)}
                        onCheckedChange={() => handleTagToggle(tag.id)}
                      />
                      <Label
                        htmlFor={`tag-${tag.id}`}
                        className="flex-1 font-normal cursor-pointer text-sm"
                      >
                        {tag.name}
                      </Label>
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="default"
            size="sm"
            onClick={onAccept}
            disabled={!selectedVaultId}
          >
            Accept
          </Button>
          <Button variant="outline" size="sm" onClick={onReject}>
            Reject
          </Button>
          {duplicatePublicationTitle && (
            <Button variant="secondary" size="sm" onClick={onMerge}>
              Merge
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onPostpone}>
            Postpone
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
