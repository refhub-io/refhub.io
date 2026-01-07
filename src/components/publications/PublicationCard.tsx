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
  StickyNote,
  Hash,
  Link2
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
  relationsCount?: number;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onExportBibtex: () => void;
}

export function PublicationCard({
  publication,
  tags,
  relationsCount = 0,
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
                <p className="text-sm text-muted-foreground mt-1.5 font-mono">
                  {formatAuthors(publication.authors)}
                  {publication.year && (
                    <span className="text-neon-green"> • {publication.year}</span>
                  )}
                </p>
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

            {publication.journal && (
              <p className="text-sm text-muted-foreground mt-2 italic font-light">
                {publication.journal}
                {publication.volume && `, vol. ${publication.volume}`}
                {publication.issue && `(${publication.issue})`}
                {publication.pages && `, pp. ${publication.pages}`}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-4">
              {tags.map((tag) => (
                <Badge 
                  key={tag.id}
                  variant="outline"
                  className="text-xs font-mono border-2 transition-all hover:scale-105"
                  style={{ 
                    backgroundColor: `${tag.color}15`,
                    color: tag.color,
                    borderColor: `${tag.color}40`
                  }}
                >
                  <Hash className="w-3 h-3 mr-1" />
                  {tag.name}
                </Badge>
              ))}

              <div className="flex items-center gap-2 ml-auto">
                {relationsCount > 0 && (
                  <div className="flex items-center gap-1 text-primary" title={`${relationsCount} related paper${relationsCount > 1 ? 's' : ''}`}>
                    <Link2 className="w-4 h-4" />
                    <span className="text-xs font-mono">{relationsCount}</span>
                  </div>
                )}
                {publication.notes && (
                  <div className="text-neon-orange" title="Has notes">
                    <StickyNote className="w-4 h-4" />
                  </div>
                )}
                {publication.pdf_url && (
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
                {publication.doi && (
                  <a
                    href={`https://doi.org/${publication.doi}`}
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
