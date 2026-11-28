import { memo, forwardRef, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Publication, Tag, Vault } from '@/types/database';
import { DraggablePublication, PublicationDragHandle } from '@/components/dnd/DraggablePublication';
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
import { ReadingProgressControl, ImportantToggle } from './ReadingStateControl';
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
  Loader2 as LoadingIcon,
} from 'lucide-react';
import { GoogleDriveIcon } from '@/components/ui/GoogleDriveIcon';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getValidHttpUrl } from '@/lib/safeUrl';
import { SharedPaperCue } from './SharedPaperCue';
import type { SharedPublicationInfo } from '@/lib/sharedPublications';

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
  dragDisabled?: boolean;
  onToggleSelect: (id: string) => void;
  onOpen?: (pub: Publication) => void;
  primaryActionLabel?: string;
  onDelete?: (pub: Publication) => void;
  /** Papers here because a vault was shared with the user, by id. */
  sharedPublications?: Record<string, SharedPublicationInfo>;
  onExportBibtex: (pub: Publication) => void;
  driveUrlsMap?: Record<string, string | null>;
  /** Set to this table's scrollToIndex, for keyboard navigation to reach rows that aren't mounted. */
  scrollToIndexRef?: MutableRefObject<((index: number) => void) | null>;
  driveLoading?: boolean;
  syncDiffCounts?: Record<string, number>;
  syncLoadingIds?: Set<string>;
  syncCooldowns?: Record<string, number>;
  onCheckSync?: (pub: Publication) => void;
  onUpdateReadingState?: (pub: Publication, patch: Partial<Pick<Publication, 'reading_state' | 'important'>>) => void;
  // Sort props
  sortBy: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  // Keyboard navigation props
  focusedIndex?: number;
  kbItemProps?: (index: number, id: string) => {
    onClick?: (e: React.MouseEvent) => void;
    onDoubleClick?: (e: React.MouseEvent) => void;
  } & Record<string, unknown>;
}

const EMPTY_STRING_ARRAY: string[] = [];

function formatAuthors(authors: string[]) {
  if (authors.length === 0) return '—';
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return authors.join(' & ');
  return `${authors[0]} et al.`;
}

function truncateText(text: string | null, maxLength: number = 50) {
  if (!text) return '—';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
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
  dragDisabled = false,
  onToggleSelect,
  onOpen,
  primaryActionLabel = 'edit',
  onDelete,
  sharedPublications,
  onExportBibtex,
  driveUrlsMap = {},
  driveLoading = false,
  syncDiffCounts = {},
  syncLoadingIds = new Set(),
  syncCooldowns = {},
  onCheckSync,
  onUpdateReadingState,
  sortBy,
  sortDirection,
  onSort,
  focusedIndex,
  kbItemProps,
  scrollToIndexRef,
}: PublicationTableProps) {
  // Only the rows on screen (and a few either side) are in the DOM. The rows scroll inside this
  // table's own area, below its sticky header, whose height offsets them.
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const [headHeight, setHeadHeight] = useState(0);
  useLayoutEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const measure = () => setHeadHeight(head.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(head);
    return () => observer.disconnect();
  }, []);
  const rowVirtualizer = useVirtualizer({
    count: publications.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 57,
    overscan: 10,
    scrollMargin: headHeight,
    scrollPaddingStart: headHeight,
    getItemKey: (index) => publications[index]?.id ?? index,
  });
  useEffect(() => {
    if (!scrollToIndexRef) return;
    scrollToIndexRef.current = (index) => rowVirtualizer.scrollToIndex(index, { align: 'auto' });
  }, [scrollToIndexRef, rowVirtualizer]);
  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastRow = virtualRows[virtualRows.length - 1];
  // Spacer rows keep the scroll height of the rows that aren't mounted.
  const spaceAbove = virtualRows.length > 0 ? virtualRows[0].start - headHeight : 0;
  const spaceBelow = lastRow ? rowVirtualizer.getTotalSize() - (lastRow.end - headHeight) : 0;

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
    <div ref={scrollRef} className="w-full border border-border rounded-lg overflow-auto scrollbar-thin max-h-[calc(100vh-16rem)]">
      <table className="w-full min-w-max caption-bottom text-sm">
        <thead ref={headRef} className="[&_tr]:border-b sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
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
            {visibleColumns.reading_state && (
              <SortableHead field="reading_state" className="w-28">State</SortableHead>
            )}
            {visibleColumns.important && (
              <SortableHead field="important" className="w-12 text-center">★</SortableHead>
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
          {spaceAbove > 0 && (
            <tr aria-hidden="true"><td colSpan={100} style={{ height: spaceAbove, padding: 0 }} /></tr>
          )}
          {virtualRows.map((row) => {
            const index = row.index;
            const pub = publications[index];
            const isSelected = selectedIds.has(pub.id);
            const dragPublicationIds = isSelected && selectedIds.size > 1
              ? Array.from(selectedIds)
              : [pub.id];

            return (
              <DraggablePublication key={row.key} publicationId={pub.id} dragPublicationIds={dragPublicationIds} disabled={dragDisabled}>
                {({ ref, listeners, attributes, isDragging }) => (
                  <PublicationTableRow
                    pub={pub}
                    index={index}
                    dataIndex={index}
                    tags={tags}
                    tagIds={publicationTagsMap[pub.id] || EMPTY_STRING_ARRAY}
                    vaults={vaults}
                    publicationVaultIds={publicationVaultsMap?.[pub.id]}
                    isSelected={isSelected}
                    isFocused={focusedIndex === index}
                    relCount={relationsCountMap[pub.id] || 0}
                    visibleColumns={visibleColumns}
                    isVaultContext={isVaultContext}
                    onToggleSelect={onToggleSelect}
                    onOpen={onOpen}
                    primaryActionLabel={primaryActionLabel}
                    onDelete={onDelete}
                    shared={sharedPublications?.[pub.id]}
                    onExportBibtex={onExportBibtex}
                    driveUrl={driveUrlsMap[pub.id] ?? null}
                    driveLoading={driveLoading}
                    syncDiffCount={syncDiffCounts[pub.id] || 0}
                    syncLoading={syncLoadingIds.has(pub.id)}
                    syncCooldown={syncCooldowns[pub.id] || 0}
                    onCheckSync={onCheckSync}
                    onUpdateReadingState={onUpdateReadingState}
                    kbItemProps={kbItemProps}
                    ref={(el) => {
                      ref(el);
                      rowVirtualizer.measureElement(el);
                    }}
                    listeners={listeners}
                    attributes={attributes}
                    isDragging={isDragging}
                  />
                )}
              </DraggablePublication>
            );
          })}
          {spaceBelow > 0 && (
            <tr aria-hidden="true"><td colSpan={100} style={{ height: spaceBelow, padding: 0 }} /></tr>
          )}
        </TableBody>
      </table>
    </div>
  );
}

interface PublicationTableRowProps extends Omit<PublicationDragHandle, 'ref'> {
  pub: Publication;
  index: number;
  tags: Tag[];
  tagIds: string[];
  vaults: Vault[];
  publicationVaultIds?: string[];
  isSelected: boolean;
  isFocused: boolean;
  relCount: number;
  visibleColumns: VisibleColumns;
  isVaultContext: boolean;
  onToggleSelect: (id: string) => void;
  onOpen?: (pub: Publication) => void;
  primaryActionLabel: string;
  onDelete?: (pub: Publication) => void;
  shared?: SharedPublicationInfo;
  onExportBibtex: (pub: Publication) => void;
  driveUrl: string | null;
  driveLoading: boolean;
  /** The row's index, as data-index, for the virtualizer to measure it. */
  dataIndex?: number;
  syncDiffCount: number;
  syncLoading: boolean;
  syncCooldown: number;
  onCheckSync?: (pub: Publication) => void;
  onUpdateReadingState?: (pub: Publication, patch: Partial<Pick<Publication, 'reading_state' | 'important'>>) => void;
  kbItemProps?: (index: number, id: string) => {
    onClick?: (e: React.MouseEvent) => void;
    onDoubleClick?: (e: React.MouseEvent) => void;
  } & Record<string, unknown>;
}

// Memoized so dragging anything else on the page (a sidebar vault, another
// row) doesn't re-render every row's full cell markup on every pointer-move —
// dnd-kit's DndContext re-renders all draggable/droppable consumers on every
// frame of any drag, so this boundary is what keeps that cheap. Every prop
// here must stay referentially/value stable across unrelated re-renders for
// the memoization to actually pay off — see the call site in PublicationTable.
const PublicationTableRow = memo(forwardRef<HTMLTableRowElement, PublicationTableRowProps>(function PublicationTableRow({
  pub,
  index,
  tags,
  tagIds,
  vaults,
  publicationVaultIds,
  isSelected,
  isFocused,
  relCount,
  visibleColumns,
  isVaultContext,
  onToggleSelect,
  onOpen,
  primaryActionLabel,
  onDelete,
  shared,
  dataIndex,
  onExportBibtex,
  driveUrl,
  driveLoading,
  syncDiffCount,
  syncLoading,
  syncCooldown,
  onCheckSync,
  onUpdateReadingState,
  kbItemProps,
  listeners,
  attributes,
  isDragging,
}, ref) {
  // Only http(s) URLs become links (see getValidHttpUrl).
  const pdfHref = getValidHttpUrl(pub.pdf_url);
  const driveHref = getValidHttpUrl(driveUrl);
  const pubTags = tags.filter((t) => tagIds.includes(t.id));
  const kbProps = kbItemProps ? kbItemProps(index, pub.id) : {};
  const {
    onClick: kbOnClick,
    onDoubleClick: kbOnDoubleClick,
    ...rowKbProps
  } = kbProps;

  return (
    <TableRow
      ref={ref}
      data-index={dataIndex}
      {...listeners}
      {...attributes}
      className={cn(
        'transition-colors',
        onOpen && 'cursor-pointer',
        isSelected && 'bg-primary/5',
        isFocused && 'ring-2 ring-inset ring-[hsl(var(--cyber-blue))]/50',
        isDragging && 'opacity-40'
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
            {shared && <SharedPaperCue shared={shared} />}
            {pub.title}
          </span>
          {syncDiffCount > 0 && (
            <Badge variant="outline" className="mt-1 w-fit font-mono text-[10px] text-neon-orange border-neon-orange/40 bg-neon-orange/10">
              sync+{syncDiffCount}
            </Badge>
          )}
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
          {publicationVaultIds && publicationVaultIds.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {publicationVaultIds.slice(0, 2).map((vaultId) => {
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
              {publicationVaultIds.length > 2 && (
                <span className="text-xs text-muted-foreground">
                  +{publicationVaultIds.length - 2}
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

      {visibleColumns.reading_state && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          <ReadingProgressControl
            value={pub.reading_state}
            onChange={onUpdateReadingState && (!shared || shared.canEdit) ? (value) => onUpdateReadingState(pub, { reading_state: value }) : undefined}
          />
        </TableCell>
      )}

      {visibleColumns.important && (
        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
          <ImportantToggle
            value={pub.important}
            onChange={onUpdateReadingState && (!shared || shared.canEdit) ? (value) => onUpdateReadingState(pub, { important: value }) : undefined}
          />
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
            {pdfHref ? (
              <a
                href={pdfHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-hot-pink transition-colors"
                title="publisher_pdf"
              >
                <FileText className="w-4 h-4" />
              </a>
            ) : null}
            {driveLoading ? (
              <LoadingIcon className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : driveHref ? (
              <a
                href={driveHref}
                target="_blank"
                rel="noopener noreferrer"
                title="open_in_drive"
                className="transition-colors hover:opacity-80"
              >
                <GoogleDriveIcon className="w-4 h-4" />
              </a>
            ) : null}
            {!pdfHref && !driveLoading && !driveHref && (
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
            {onCheckSync && (
              <DropdownMenuItem onClick={() => onCheckSync(pub)} disabled={syncLoading || syncCooldown > 0 || !pub.doi}>
                <LoadingIcon className={`w-4 h-4 mr-2 ${syncLoading ? 'animate-spin' : ''}`} />
                {syncCooldown > 0 ? `sync cooldown ${syncCooldown}s` : 'sync details'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onExportBibtex(pub)}>
              <Download className="w-4 h-4 mr-2" />
              export bibtex
            </DropdownMenuItem>
            {onDelete && !shared && (
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
}));
PublicationTableRow.displayName = 'PublicationTableRow';
