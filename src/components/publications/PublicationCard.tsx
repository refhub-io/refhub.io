import { Publication, Tag, Vault } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { VisibleColumns } from './ViewSettings';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { useState } from 'react';
import {
  ExternalLink,
  MoreVertical,
  Edit,
  Trash2,
  Download,
  StickyNote,
  Link2,
  ChevronDown,
  Loader2
} from 'lucide-react';
import { GoogleDriveIcon } from '@/components/ui/GoogleDriveIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { HierarchicalTagBadge } from '@/components/tags/HierarchicalTagBadge';

interface PublicationCardProps {
  publication: Publication;
  tags: Tag[];
  allTags: Tag[];
  vaults?: Vault[];
  publicationVaults?: string[]; // IDs of vaults this publication belongs to
  relationsCount?: number;
  isSelected: boolean;
  isFocused?: boolean; // keyboard roving focus
  visibleColumns?: VisibleColumns;
  isVaultContext?: boolean; // If true, shows "remove from vault" instead of "delete"
  onToggleSelect: () => void;
  onOpen?: () => void;
  primaryActionLabel?: string;
  onDelete?: () => void;
  onExportBibtex: () => void;
  driveUrl?: string | null;
  driveLoading?: boolean;
}

export function PublicationCard({
  publication,
  tags,
  allTags,
  vaults = [],
  publicationVaults,
  relationsCount = 0,
  isSelected,
  isFocused = false,
  visibleColumns,
  isVaultContext = false,
  onToggleSelect,
  onOpen,
  primaryActionLabel = 'edit',
  onDelete,
  onExportBibtex,
  driveUrl,
  driveLoading = false,
}: PublicationCardProps) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  
  const formatAuthors = (authors: string[]) => {
    if (authors.length === 0) return 'Unknown author';
    if (authors.length === 1) return authors[0];
    if (authors.length === 2) return authors.join(' & ');
    return `${authors[0]} et al.`;
  };

  // Default all properties visible if no visibleColumns provided
  const show = visibleColumns || {
    title: true,
    authors: true,
    year: true,
    journal: true,
    tags: true,
    vault: true,
    doi: true,
    notes: true,
    type: true,
    relations: true,
    pdf: true,
    abstract: false,
  };

  return (
    <Card 
      className={cn(
        "group transition-all duration-300 border-2",
        onOpen && "cursor-pointer",
        isSelected 
          ? "border-primary/50 bg-primary/5 shadow-lg glow-purple" 
          : "border-border hover:border-primary/30",
        isFocused && "ring-2 ring-[hsl(var(--cyber-blue))]/50 ring-offset-1 ring-offset-background"
      )}
      onClick={onOpen}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div 
            className="pt-1"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
          >
            <Checkbox 
              checked={isSelected}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary h-5 w-5 rounded-md"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                  {publication.title}
                </h3>
                {(show.authors || show.year || show.type) && (
                  <p className="text-sm text-muted-foreground mt-1.5 font-mono">
                    {show.authors && formatAuthors(publication.authors)}
                    {show.year && publication.year && (
                      <span className="text-neon-green">{show.authors ? ' • ' : ''}{publication.year}</span>
                    )}
                    {show.type && publication.publication_type && (
                      <span className="text-cyber-blue">{(show.authors || show.year) ? ' • ' : ''}{publication.publication_type}</span>
                    )}
                  </p>
                )}
                {show.doi && publication.doi && (
                  <a
                    href={`https://doi.org/${encodeURIComponent(publication.doi)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-mono text-muted-foreground/70 hover:text-foreground transition-colors mt-1 inline-block"
                  >
                    {publication.doi}
                  </a>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {show.pdf && publication.pdf_url && (
                  <a
                    href={publication.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded-md hover:bg-muted"
                  >
                    publisher_pdf
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {driveLoading && (
                  <span className="flex items-center px-1.5 py-1">
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  </span>
                )}
                {!driveLoading && driveUrl && (
                  <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="open_in_drive"
                    className="flex items-center px-1.5 py-1 rounded-md hover:bg-muted transition-colors"
                  >
                    <GoogleDriveIcon className="w-3.5 h-3.5" />
                  </a>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-9 w-9"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {onOpen && (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen(); }}>
                        <Edit className="w-4 h-4 mr-2" />
                        {primaryActionLabel}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onExportBibtex(); }}>
                      <Download className="w-4 h-4 mr-2" />
                      export bibtex
                    </DropdownMenuItem>
                    {onDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={(e) => { e.stopPropagation(); onDelete(); }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {isVaultContext ? 'remove from vault' : 'delete'}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {show.journal && publication.journal && (
              <p className="text-sm text-muted-foreground mt-2 italic font-light">
                {publication.journal}
                {publication.volume && `, vol. ${publication.volume}`}
                {publication.issue && `(${publication.issue})`}
                {publication.pages && `, pp. ${publication.pages}`}
              </p>
            )}

            {show.vault && publicationVaults && publicationVaults.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {publicationVaults.map((vaultId) => {
                  const vault = vaults?.find(v => v.id === vaultId);
                  return vault ? (
                    <span
                      key={vaultId}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-mono bg-secondary border"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: vault.color }}
                      />
                      {vault.name}
                    </span>
                  ) : null;
                })}
              </div>
            )}

            {show.abstract && publication.abstract && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {publication.abstract}
              </p>
            )}

            {/* Tags & metadata row */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {show.tags && tags.map((tag) => (
                <HierarchicalTagBadge
                  key={tag.id}
                  tag={tag}
                  allTags={allTags}
                  size="sm"
                  showHierarchy
                />
              ))}

              <div className="flex items-center gap-2 ml-auto">
                {show.relations && relationsCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground">
                    <Link2 className="w-3.5 h-3.5" />
                    {relationsCount}
                  </span>
                )}
                {show.notes && publication.notes && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotesExpanded(!notesExpanded);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-mono text-neon-orange hover:text-neon-orange/80 transition-colors"
                    title="toggle notes"
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                    notes
                    <ChevronDown className={cn("w-3 h-3 transition-transform", notesExpanded && "rotate-180")} />
                  </button>
                )}
              </div>
            </div>

            {/* Collapsible Notes Preview */}
            {show.notes && publication.notes && notesExpanded && (
              <div className="mt-4 pt-4 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-2">
                  <StickyNote className="w-3.5 h-3.5 text-neon-orange" />
                  <span className="text-xs font-mono text-muted-foreground">// notes</span>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none p-3 rounded-md bg-muted/30 border border-border/50">
                  <MarkdownRenderer compact>
                    {publication.notes}
                  </MarkdownRenderer>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
