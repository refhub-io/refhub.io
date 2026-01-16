import { Publication, Tag, Vault } from '@/types/database';
import {
  Table,
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
import {
  MoreVertical,
  Edit,
  Trash2,
  Download,
  ExternalLink,
  FileText,
  StickyNote,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PublicationTableProps {
  publications: Publication[];
  tags: Tag[];
  vaults: Vault[];
  publicationTagsMap: Record<string, string[]>;
  relationsCountMap: Record<string, number>;
  selectedIds: Set<string>;
  visibleColumns: VisibleColumns;
  onToggleSelect: (id: string) => void;
  onEdit: (pub: Publication) => void;
  onDelete: (pub: Publication) => void;
  onExportBibtex: (pub: Publication) => void;
}

export function PublicationTable({
  publications,
  tags,
  vaults,
  publicationTagsMap,
  relationsCountMap,
  selectedIds,
  visibleColumns,
  onToggleSelect,
  onEdit,
  onDelete,
  onExportBibtex,
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

  return (
    <div className="w-full border border-border rounded-lg overflow-x-auto">
      <Table className="min-w-max">
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="w-10">
              <span className="sr-only">Select</span>
            </TableHead>
            {visibleColumns.title && (
              <TableHead className="font-mono text-xs">Title</TableHead>
            )}
            {visibleColumns.authors && (
              <TableHead className="font-mono text-xs">Authors</TableHead>
            )}
            {visibleColumns.year && (
              <TableHead className="font-mono text-xs w-16">Year</TableHead>
            )}
            {visibleColumns.journal && (
              <TableHead className="font-mono text-xs">Journal</TableHead>
            )}
            {visibleColumns.tags && (
              <TableHead className="font-mono text-xs">Tags</TableHead>
            )}
            {visibleColumns.vault && (
              <TableHead className="font-mono text-xs">Vault</TableHead>
            )}
            {visibleColumns.type && (
              <TableHead className="font-mono text-xs w-24">Type</TableHead>
            )}
            {visibleColumns.relations && (
              <TableHead className="font-mono text-xs w-16 text-center">Links</TableHead>
            )}
            {visibleColumns.doi && (
              <TableHead className="font-mono text-xs w-16 text-center">DOI</TableHead>
            )}
            {visibleColumns.pdf && (
              <TableHead className="font-mono text-xs w-16 text-center">PDF</TableHead>
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
        </TableHeader>
        <TableBody>
          {publications.map((pub) => {
            const pubTags = getPublicationTags(pub.id);
            const isSelected = selectedIds.has(pub.id);
            const relCount = relationsCountMap[pub.id] || 0;

            return (
              <TableRow
                key={pub.id}
                className={cn(
                  'cursor-pointer transition-colors',
                  isSelected && 'bg-primary/5'
                )}
                onClick={() => onEdit(pub)}
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
                    {getVaultName(pub.vault_id)}
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
                    {pub.pdf_url ? (
                      <a
                        href={pub.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-hot-pink transition-colors"
                        title="View PDF"
                      >
                        <FileText className="w-4 h-4 mx-auto" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
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
                      <DropdownMenuItem onClick={() => onEdit(pub)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onExportBibtex(pub)}>
                        <Download className="w-4 h-4 mr-2" />
                        Export BibTeX
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(pub)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
