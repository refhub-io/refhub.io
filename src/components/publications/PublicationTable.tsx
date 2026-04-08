import { Publication, Tag, Vault } from '@/types/database';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HierarchicalTagBadge } from '@/components/tags/HierarchicalTagBadge';
import { VisibleColumns } from './ViewSettings';
import { SortField, SortDirection } from '@/hooks/useViewSettingsPersistence';
import {
  MoreVertical,
  Edit,
  Trash2,
  Download,
  ExternalLink,
  FileText,
  StickyNote,
  Link2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Loader2,
} from 'lucide-react';
import { GoogleDriveIcon } from '@/components/ui/GoogleDriveIcon';
import { cn } from '@/lib/utils';

interface PublicationTableProps {
  publications: Publication[];
  tags: Tag[];
  vaults: Vault[];
  publicationTagsMap: Record<string, string[]>;
  publicationVaultsMap?: Record<string, string[]>; // Map of publication IDs to vault IDs
  relationsCountMap: Record<string, number>;
  selectedIds: Set<string>;
  visibleColumns: VisibleColumns;
  isVaultContext?: boolean; // If true, shows "remove from vault" instead of "delete"
  onToggleSelect: (id: string) => void;
  onOpen?: (pub: Publication) => void;
  primaryActionLabel?: string;
  onDelete?: (pub: Publication) => void;
  onExportBibtex: (pub: Publication) => void;
  driveUrlsMap?: Record<string, string | null>;
  driveLoading?: boolean;
  // Sort props
  sortBy: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  // Keyboard navigation props
  focusedIndex?: number;
  kbItemProps?: (index: number, id: string) => Record<string, unknown>;
}

export function PublicationTable({
  publications,
  tags,
  vaults,
  publicationTagsMap,
  publicationVaultsMap,
  relationsCountMap,
  selectedIds,
  visibleColumns,
  isVaultContext = false,
  onToggleSelect,
  onOpen,
  primaryActionLabel = 'edit',
  onDelete,
  onExportBibtex,
  driveUrlsMap = {},
  driveLoading = false,
  sortBy,
  sortDirection,
  onSort,
  focusedIndex,
  kbItemProps,
}: PublicationTableProps) {
  const getPublicationTags = (pubId: string): Tag[] => {
    const tagIds = publicationTagsMap[pubId] || [];
    return tags.filter((t) => tagIds.includes(t.id));
  };

  const getVaultName = (vaultId: string | null): string => {
    if (!vaultId) return '—';
    const vault = vaults.find((v) => v.id === vaultId);
    return vault?.name || '—';
  };

  const formatAuthors = (authors: string[]) => {
    if (authors.length === 0) return '—';
    if (authors.length === 1) return authors[0];
    if (authors.length === 2) return authors.join(' & ');
    return `${authors[0]} et al.`;
  };

  const truncateText = (text: string | null, maxLength: number = 50) => {
    if (!text) return '—';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Sort indicator component for sortable column headers
  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-0 group-hover/sort:opacity-50 transition-opacity" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 text-primary" />
      : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
  };

  // Sortable header cell
  const SortableHead = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={cn("font-mono text-xs cursor-pointer select-none group/sort hover:text-foreground transition-colors", className)}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center">
        {children}
        <SortIndicator field={field} />
      </span>
    </TableHead>
  );

  return (
    <div className="w-full border border-border rounded-lg overflow-auto max-h-[calc(100vh-16rem)]">
      <table className="w-full min-w-max caption-bottom text-sm">
        <thead className="[&_tr]:border-b sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="w-10">
              <span className="sr-only">Select</span>
            </TableHead>
            {visibleColumns.title && (
              <SortableHead field="title">Title</SortableHead>
            )}
            {visibleColumns.authors && (
              <SortableHead field="authors">Authors</SortableHead>
            )}
            {visibleColumns.year && (
              <SortableHead field="year" className="w-16">Year</SortableHead>
            )}
            {visibleColumns.journal && (
              <SortableHead field="journal">Journal</SortableHead>
            )}
            {visibleColumns.tags && (
              <TableHead className="font-mono text-xs">Tags</TableHead>
            )}
            {visibleColumns.vault && (
              <TableHead className="font-mono text-xs">Vault</TableHead>
            )}
            {visibleColumns.type && (
              <SortableHead field="type" className="w-24">Type</SortableHead>
            )}
            {visibleColumns.relations && (
              <TableHead className="font-mono text-xs w-16 text-center">Links</TableHead>
            )}
            {visibleColumns.doi && (
              <TableHead className="font-mono text-xs w-16 text-center">DOI</TableHead>
            )}
            {visibleColumns.pdf && (
              <TableHead className="font-mono text-xs w-24 text-center">pdf</TableHead>
            )}
            {visibleColumns.notes && (
              <TableHead className="font-mono text-xs w-16 text-center">Notes</TableHead>
            )}
            {visibleColumns.abstract && (
              <TableHead className="font-mono text-xs max-w-xs">Abstract</TableHead>
            )}
            <TableHead className="w-10">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </thead>
        <TableBody>
          {publications.map((pub, index) => {
            const pubTags = getPublicationTags(pub.id);
            const isSelected = selectedIds.has(pub.id);
            const isFocused = focusedIndex === index;
            const relCount = relationsCountMap[pub.id] || 0;
            const kbProps = kbItemProps ? kbItemProps(index, pub.id) : {};
            const {
              onClick: kbOnClick,
              onDoubleClick: kbOnDoubleClick,
              ...rowKbProps
            } = kbProps;

            return (
              <TableRow
                key={pub.id}
                className={cn(
                  'transition-colors',
                  onOpen && 'cursor-pointer',
                  isSelected && 'bg-primary/5',
                  isFocused && 'ring-2 ring-inset ring-[hsl(var(--cyber-blue))]/50'
                )}
                onClick={(e) => {
                  kbOnClick?.(e);
                  if (!e.defaultPrevented && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    onOpen?.(pub);
                  }
                }}
                onDoubleClick={(e) => {
                  kbOnDoubleClick?.(e);
                }}
                {...rowKbProps}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(pub.id)}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </TableCell>

                {visibleColumns.title && (
                  <TableCell className="font-medium max-w-xs">
                    <span className="line-clamp-2 hover:text-primary transition-colors">
                      {pub.title}
                    </span>
                  </TableCell>
                )}

                {visibleColumns.authors && (
                  <TableCell className="text-muted-foreground text-sm font-mono max-w-[200px]">
                    {formatAuthors(pub.authors)}
                  </TableCell>
                )}

                {visibleColumns.year && (
                  <TableCell className="text-neon-green font-mono text-sm">
                    {pub.year || '—'}
                  </TableCell>
                )}

                {visibleColumns.journal && (
                  <TableCell className="text-muted-foreground text-sm italic max-w-[200px] truncate">
                    {pub.journal || '—'}
                  </TableCell>
                )}

                {visibleColumns.tags && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {pubTags.length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        pubTags.slice(0, 3).map((tag) => (
                          <HierarchicalTagBadge
                            key={tag.id}
                            tag={tag}
                            allTags={tags}
                            size="sm"
                          />
                        ))
                      )}
                      {pubTags.length > 3 && (
                        <span className="text-xs text-muted-foreground font-mono">
                          +{pubTags.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                )}

                {visibleColumns.vault && (
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {publicationVaultsMap && publicationVaultsMap[pub.id] && publicationVaultsMap[pub.id].length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {publicationVaultsMap[pub.id].slice(0, 2).map((vaultId) => {
                          const vault = vaults.find(v => v.id === vaultId);
                          return vault ? (
                            <span
                              key={vaultId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-secondary border"
                            >
                              <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: vault.color }}
                              />
                              {vault.name}
                            </span>
                          ) : null;
                        })}
                        {publicationVaultsMap[pub.id].length > 2 && (
                          <span className="text-xs text-muted-foreground">
                            +{publicationVaultsMap[pub.id].length - 2}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                )}

                {visibleColumns.type && (
                  <TableCell className="text-xs font-mono text-muted-foreground capitalize">
                    {pub.publication_type || '—'}
                  </TableCell>
                )}

                {visibleColumns.relations && (
                  <TableCell className="text-center">
                    {relCount > 0 ? (
                      <div className="flex items-center justify-center gap-1 text-primary">
                        <Link2 className="w-3.5 h-3.5" />
                        <span className="text-xs font-mono">{relCount}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                )}

                {visibleColumns.doi && (
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    {pub.doi ? (
                      <a
                        href={`https://doi.org/${encodeURIComponent(pub.doi)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-cyber-blue transition-colors"
                        title={pub.doi}
                      >
                        <ExternalLink className="w-4 h-4 mx-auto" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                )}

                {visibleColumns.pdf && (
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      {pub.pdf_url ? (
                        <a
                          href={pub.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-hot-pink transition-colors"
                          title="publisher_pdf"
                        >
                          <FileText className="w-4 h-4" />
                        </a>
                      ) : null}
                      {driveLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                      ) : driveUrlsMap[pub.id] ? (
                        <a
                          href={driveUrlsMap[pub.id]!}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="open_in_drive"
                          className="transition-colors hover:opacity-80"
                        >
                          <GoogleDriveIcon className="w-4 h-4" />
                        </a>
                      ) : null}
                      {!pub.pdf_url && !driveLoading && !driveUrlsMap[pub.id] && (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </div>
                  </TableCell>
                )}

                {visibleColumns.notes && (
                  <TableCell className="text-center">
                    {pub.notes ? (
                      <div title="Has notes">
                        <StickyNote className="w-4 h-4 mx-auto text-neon-orange" />
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                )}

                {visibleColumns.abstract && (
                  <TableCell className="text-xs text-muted-foreground max-w-xs">
                    {truncateText(pub.abstract, 100)}
                  </TableCell>
                )}

                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      {onOpen && (
                        <DropdownMenuItem onClick={() => onOpen(pub)}>
                          <Edit className="w-4 h-4 mr-2" />
                          {primaryActionLabel}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onExportBibtex(pub)}>
                        <Download className="w-4 h-4 mr-2" />
                        export bibtex
                      </DropdownMenuItem>
                      {onDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDelete(pub)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {isVaultContext ? 'remove from vault' : 'delete'}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </table>
    </div>
  );
}
