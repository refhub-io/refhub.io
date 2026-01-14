import { Publication, Tag, Vault } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { VisibleColumns } from './ViewSettings';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';
import { 
  FileText, 
  ExternalLink, 
  MoreVertical, 
  Edit, 
  Trash2, 
  Download,
  StickyNote,
  Link2,
  ChevronDown
} from 'lucide-react';
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
  relationsCount?: number;
  isSelected: boolean;
  visibleColumns?: VisibleColumns;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onExportBibtex: () => void;
}

export function PublicationCard({
  publication,
  tags,
  allTags,
  vaults = [],
  relationsCount = 0,
  isSelected,
  visibleColumns,
  onToggleSelect,
  onEdit,
  onDelete,
  onExportBibtex,
}: PublicationCardProps) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  
  const formatAuthors = (authors: string[]) => {
    if (authors.length === 0) return 'Unknown author';
    if (authors.length === 1) return authors[0];
    if (authors.length === 2) return authors.join(' & ');
    return `${authors[0]} et al.`;
  };

  const getVaultName = (vaultId: string | null): string | null => {
    if (!vaultId) return null;
    const vault = vaults.find((v) => v.id === vaultId);
    return vault?.name || null;
  };

  const vaultName = getVaultName(publication.vault_id);

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
        "group transition-all duration-300 cursor-pointer border-2",
        isSelected 
          ? "border-primary/50 bg-primary/5 shadow-lg glow-purple" 
          : "border-border hover:border-primary/30"
      )}
      onClick={onEdit}
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
                {show.authors && (
                  <p className="text-sm text-muted-foreground mt-1.5 font-mono">
                    {formatAuthors(publication.authors)}
                    {show.year && publication.year && (
                      <span className="text-neon-green"> • {publication.year}</span>
                    )}
                  </p>
                )}
              </div>

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
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onExportBibtex(); }}>
                    <Download className="w-4 h-4 mr-2" />
                    Export BibTeX
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {show.journal && publication.journal && (
              <p className="text-sm text-muted-foreground mt-2 italic font-light">
                {publication.journal}
                {publication.volume && `, vol. ${publication.volume}`}
                {publication.issue && `(${publication.issue})`}
                {publication.pages && `, pp. ${publication.pages}`}
              </p>
            )}

            {show.vault && vaultName && (
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                <span className="text-primary">vault:</span> {vaultName}
              </p>
            )}

            {show.abstract && publication.abstract && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {publication.abstract}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-4">
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
                  <div className="flex items-center gap-1 text-primary" title={`${relationsCount} related paper${relationsCount > 1 ? 's' : ''}`}>
                    <Link2 className="w-4 h-4" />
                    <span className="text-xs font-mono">{relationsCount}</span>
                  </div>
                )}
                {show.notes && publication.notes && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotesExpanded(!notesExpanded);
                    }}
                    className="flex items-center gap-1 text-neon-orange hover:text-neon-orange/80 transition-colors"
                    title="Toggle notes preview"
                  >
                    <StickyNote className="w-4 h-4" />
                    <ChevronDown className={cn("w-3 h-3 transition-transform", notesExpanded && "rotate-180")} />
                  </button>
                )}
                {show.pdf && publication.pdf_url && (
                  <a
                    href={publication.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-neon-pink transition-colors"
                    title="View PDF"
                  >
                    <FileText className="w-4 h-4" />
                  </a>
                )}
                {show.doi && publication.doi && (
                  <a
                    href={`https://doi.org/${encodeURIComponent(publication.doi)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-neon-blue transition-colors"
                    title="View DOI"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {publication.notes}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
