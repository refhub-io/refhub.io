import { useState } from 'react';
import type { InboxItem, InboxItemStatus, Vault, Tag } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { KbdHint } from '@/components/ui/KbdHint';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
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

// Matches the muted/neon-green/destructive/cyber-blue palette already used
// for status-ish badges elsewhere (e.g. PublicationCard's sync/type badges)
// instead of introducing new colors just for this one card.
const STATUS_BADGE_CLASSES: Record<InboxItemStatus, string> = {
  pending: 'text-muted-foreground border-border',
  accepted: 'text-neon-green border-neon-green/40 bg-neon-green/10',
  rejected: 'text-destructive border-destructive/40 bg-destructive/10',
  merged: 'text-cyber-blue border-cyber-blue/40 bg-cyber-blue/10',
};

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

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));

  const handleTagToggle = (tagId: string) => {
    const newTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    onTagsChange(newTagIds);
  };

  return (
    <Card
      className={cn(
        "group transition-all duration-300 border-2",
        focused ? "ring-2 ring-[hsl(var(--cyber-blue))]/50 ring-offset-1 ring-offset-background" : "border-border hover:border-primary/30",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base sm:text-lg font-bold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {title}
            </CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 font-mono">
              {authorsString}
              {year && <span className="text-neon-green">{' • '}{year}</span>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="outline" className="font-mono text-[10px]">
              {item.source_type}
            </Badge>
            <Badge variant="outline" className={cn('font-mono text-[10px]', STATUS_BADGE_CLASSES[item.status])}>
              {item.status}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Duplicate banner — same orange treatment AddImportDialog's own
            "possible duplicate" warning already uses. */}
        {duplicatePublicationTitle && (
          <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/30 rounded-md px-3 py-2">
            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 text-xs font-mono text-orange-600 dark:text-orange-400">
              <p className="font-semibold">duplicate_detected</p>
              <p>matches: <em>{duplicatePublicationTitle}</em></p>
            </div>
          </div>
        )}

        {/* Vault select */}
        <div className="space-y-2">
          <Label htmlFor={`vault-select-${item.id}`} className="text-sm font-semibold font-mono">
            vault
          </Label>
          <Select value={selectedVaultId || ''} onValueChange={(value) => onVaultChange(value || null)}>
            <SelectTrigger id={`vault-select-${item.id}`} className="font-mono text-sm">
              <SelectValue placeholder="select_vault" />
            </SelectTrigger>
            <SelectContent>
              {vaults.map((vault) => (
                <SelectItem key={vault.id} value={vault.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-md shrink-0" style={{ backgroundColor: vault.color }} />
                    {vault.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tag multi-select */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold font-mono">tags</Label>

          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-md border border-border">
              {selectedTags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="cursor-pointer group/tag font-mono text-xs"
                  onClick={() => handleTagToggle(tag.id)}
                >
                  {tag.name}
                  <X className="h-3 w-3 ml-1 group-hover/tag:opacity-100 opacity-70" />
                </Badge>
              ))}
            </div>
          )}

          <Popover open={isTagsOpen} onOpenChange={setIsTagsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start font-mono text-xs"
              >
                {selectedTags.length === 0
                  ? 'select_tags...'
                  : `${selectedTags.length} tag${selectedTags.length !== 1 ? 's' : ''}_selected`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="start">
              <div className="space-y-3">
                {tags.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-mono text-center py-4">
                    // no_tags_available
                  </p>
                ) : (
                  tags.map((tag) => (
                    <div key={tag.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`tag-${item.id}-${tag.id}`}
                        checked={selectedTagIds.includes(tag.id)}
                        onCheckedChange={() => handleTagToggle(tag.id)}
                      />
                      <Label
                        htmlFor={`tag-${item.id}-${tag.id}`}
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
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="glow"
            size="sm"
            onClick={onAccept}
            disabled={!selectedVaultId}
            className="font-mono"
          >
            accept
            <KbdHint shortcut="a" className="ml-1.5 [&_kbd]:bg-white/20 [&_kbd]:border-white/30 [&_kbd]:text-primary-foreground [&_kbd]:shadow-none" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onReject} className="font-mono">
            reject
            <KbdHint shortcut="x" className="ml-1.5" />
          </Button>
          {duplicatePublicationTitle && (
            <Button type="button" variant="secondary" size="sm" onClick={onMerge} className="font-mono">
              merge
              <KbdHint shortcut="m" className="ml-1.5" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onPostpone} className="font-mono">
            postpone
            <KbdHint shortcut="s" className="ml-1.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
