import { useState } from 'react';
import type { InboxItemStatus } from '@/types/database';
import type { InboxItemCardProps } from './InboxItemCard';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertCircle, Check, X, GitMerge, Clock } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const STATUS_BADGE_CLASSES: Record<InboxItemStatus, string> = {
  pending: 'text-muted-foreground border-border',
  accepted: 'text-neon-green border-neon-green/40 bg-neon-green/10',
  rejected: 'text-destructive border-destructive/40 bg-destructive/10',
  merged: 'text-cyber-blue border-cyber-blue/40 bg-cyber-blue/10',
};

/** Table-row alternative to InboxItemCard, matching the same look as
 * PublicationTable's row/column conventions -- same props/actions as the
 * card, denser layout for triaging a long queue. Must be rendered inside a
 * <TableBody> (see InboxQueue's list-view branch). */
export function InboxItemRow(props: InboxItemCardProps): JSX.Element {
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

  const handleTagToggle = (tagId: string) => {
    const newTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    onTagsChange(newTagIds);
  };

  return (
    <TableRow className={cn(focused && 'bg-muted/50 ring-1 ring-inset ring-[hsl(var(--cyber-blue))]/50')}>
      <TableCell className="font-medium max-w-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="line-clamp-2">{title}</span>
          {duplicatePublicationTitle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="font-mono text-xs">
                duplicate_detected: <em>{duplicatePublicationTitle}</em>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
          {authorsString}
          {year && <span className="text-neon-green">{' • '}{year}</span>}
        </p>
      </TableCell>

      <TableCell>
        <Badge variant="outline" className="font-mono text-[10px]">{item.source_type}</Badge>
      </TableCell>

      <TableCell>
        <Badge variant="outline" className={cn('font-mono text-[10px]', STATUS_BADGE_CLASSES[item.status])}>
          {item.status}
        </Badge>
      </TableCell>

      <TableCell>
        <Label htmlFor={`row-vault-select-${item.id}`} className="sr-only">vault</Label>
        <Select value={selectedVaultId || ''} onValueChange={(value) => onVaultChange(value || null)}>
          <SelectTrigger id={`row-vault-select-${item.id}`} className="font-mono text-xs h-8 w-40">
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
      </TableCell>

      <TableCell>
        <Popover open={isTagsOpen} onOpenChange={setIsTagsOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 font-mono text-xs">
              {selectedTagIds.length === 0
                ? 'select_tags...'
                : `${selectedTagIds.length} tag${selectedTagIds.length !== 1 ? 's' : ''}_selected`}
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
                      id={`row-tag-${item.id}-${tag.id}`}
                      checked={selectedTagIds.includes(tag.id)}
                      onCheckedChange={() => handleTagToggle(tag.id)}
                    />
                    <Label htmlFor={`row-tag-${item.id}-${tag.id}`} className="flex-1 font-normal cursor-pointer text-sm">
                      {tag.name}
                    </Label>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  </div>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </TableCell>

      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="glow" size="icon" className="h-8 w-8" onClick={onAccept} disabled={!selectedVaultId} aria-label="Accept">
                <Check className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-mono text-xs">accept (a)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={onReject} aria-label="Reject">
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-mono text-xs">reject (x)</TooltipContent>
          </Tooltip>
          {duplicatePublicationTitle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="secondary" size="icon" className="h-8 w-8" onClick={onMerge} aria-label="Merge">
                  <GitMerge className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="font-mono text-xs">merge (m)</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onPostpone} aria-label="Postpone">
                <Clock className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-mono text-xs">postpone (s)</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}
