import { Publication, Tag } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  FileText, 
  ExternalLink, 
  MoreVertical, 
  Edit, 
  Trash2, 
  Download,
  StickyNote
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface PublicationCardProps {
  publication: Publication;
  tags: Tag[];
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onExportBibtex: () => void;
}

export function PublicationCard({
  publication,
  tags,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
  onExportBibtex,
}: PublicationCardProps) {
  const formatAuthors = (authors: string[]) => {
    if (authors.length === 0) return 'Unknown author';
    if (authors.length === 1) return authors[0];
    if (authors.length === 2) return authors.join(' & ');
    return `${authors[0]} et al.`;
  };

  return (
    <Card 
      className={cn(
        "group transition-all duration-200 hover:shadow-md cursor-pointer border-border/50",
        isSelected && "ring-2 ring-primary/50 border-primary/50"
      )}
      onClick={onEdit}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div 
            className="pt-1"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
          >
            <Checkbox 
              checked={isSelected}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-lg font-semibold text-foreground leading-tight line-clamp-2">
                  {publication.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatAuthors(publication.authors)}
                  {publication.year && ` (${publication.year})`}
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
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

            {publication.journal && (
              <p className="text-sm text-muted-foreground mt-1 italic">
                {publication.journal}
                {publication.volume && `, ${publication.volume}`}
                {publication.issue && `(${publication.issue})`}
                {publication.pages && `, pp. ${publication.pages}`}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {tags.map((tag) => (
                <Badge 
                  key={tag.id}
                  variant="secondary"
                  className="text-xs font-normal"
                  style={{ 
                    backgroundColor: `${tag.color}20`,
                    color: tag.color,
                    borderColor: `${tag.color}40`
                  }}
                >
                  {tag.name}
                </Badge>
              ))}

              <div className="flex items-center gap-1 ml-auto">
                {publication.notes && (
                  <div className="text-muted-foreground" title="Has notes">
                    <StickyNote className="w-4 h-4" />
                  </div>
                )}
                {publication.pdf_url && (
                  <a
                    href={publication.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title="View PDF"
                  >
                    <FileText className="w-4 h-4" />
                  </a>
                )}
                {publication.doi && (
                  <a
                    href={`https://doi.org/${publication.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title="View DOI"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
