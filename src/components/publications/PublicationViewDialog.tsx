import { Publication, Tag } from '@/types/database';
import { formatTimeAgo } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HierarchicalTagBadge } from '@/components/tags/HierarchicalTagBadge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExternalLink, FileText, Pencil } from 'lucide-react';

interface PublicationViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publication: Publication | null;
  tags: Tag[];
  allTags: Tag[];
  onEdit?: (publication: Publication) => void;
}

const DETAIL_FIELDS: Array<{ key: keyof Publication; label: string }> = [
  { key: 'journal', label: 'journal' },
  { key: 'booktitle', label: 'booktitle' },
  { key: 'publisher', label: 'publisher' },
  { key: 'institution', label: 'institution' },
  { key: 'school', label: 'school' },
  { key: 'organization', label: 'organization' },
  { key: 'volume', label: 'volume' },
  { key: 'issue', label: 'issue' },
  { key: 'pages', label: 'pages' },
  { key: 'chapter', label: 'chapter' },
  { key: 'edition', label: 'edition' },
  { key: 'series', label: 'series' },
  { key: 'number', label: 'number' },
  { key: 'type', label: 'type' },
  { key: 'eid', label: 'eid' },
  { key: 'isbn', label: 'isbn' },
  { key: 'issn', label: 'issn' },
  { key: 'bibtex_key', label: 'bibtex_key' },
  { key: 'howpublished', label: 'howpublished' },
];

export function PublicationViewDialog({
  open,
  onOpenChange,
  publication,
  tags,
  allTags,
  onEdit,
}: PublicationViewDialogProps) {
  if (!publication) return null;

  const metadata = DETAIL_FIELDS.filter(({ key }) => {
    const value = publication[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:w-full sm:max-w-3xl max-h-[90vh] overflow-y-auto border-2 bg-card/95 backdrop-blur-xl">
        <DialogHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {publication.publication_type && (
              <Badge variant="outline" className="font-mono text-xs">
                {publication.publication_type}
              </Badge>
            )}
            {publication.year && (
              <Badge variant="secondary" className="font-mono text-xs">
                {publication.year}
              </Badge>
            )}
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-bold leading-tight">
            {publication.title}
          </DialogTitle>
          <DialogDescription className="text-sm font-mono">
            {publication.authors.length > 0 ? publication.authors.join(', ') : 'unknown author'}
            {publication.updated_at && ` • updated ${formatTimeAgo(publication.updated_at)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {(publication.doi || publication.url || publication.pdf_url) && (
            <div className="flex flex-wrap gap-2">
              {publication.doi && (
                <Button asChild variant="outline" size="sm" className="font-mono">
                  <a
                    href={`https://doi.org/${encodeURIComponent(publication.doi)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    doi
                  </a>
                </Button>
              )}
              {publication.url && (
                <Button asChild variant="outline" size="sm" className="font-mono">
                  <a href={publication.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    link
                  </a>
                </Button>
              )}
              {publication.pdf_url && (
                <Button asChild variant="outline" size="sm" className="font-mono">
                  <a href={publication.pdf_url} target="_blank" rel="noopener noreferrer">
                    <FileText className="w-4 h-4 mr-2" />
                    pdf
                  </a>
                </Button>
              )}
            </div>
          )}

          {tags.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold font-mono">tags</h3>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <HierarchicalTagBadge
                    key={tag.id}
                    tag={tag}
                    allTags={allTags}
                    size="sm"
                    showHierarchy
                  />
                ))}
              </div>
            </section>
          )}

          {publication.abstract && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold font-mono">abstract</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-6">
                {publication.abstract}
              </p>
            </section>
          )}

          {publication.notes && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold font-mono">notes</h3>
              <div className="rounded-lg border bg-muted/20 p-4">
                <MarkdownRenderer compact>{publication.notes}</MarkdownRenderer>
              </div>
            </section>
          )}

          {(metadata.length > 0 || publication.editor?.length || publication.keywords?.length) && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold font-mono">details</h3>
              <dl className="grid gap-3 sm:grid-cols-2">
                {metadata.map(({ key, label }) => (
                  <div key={key} className="rounded-lg border bg-muted/10 p-3">
                    <dt className="text-xs font-mono text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-sm break-words">{String(publication[key])}</dd>
                  </div>
                ))}
                {publication.editor?.length ? (
                  <div className="rounded-lg border bg-muted/10 p-3">
                    <dt className="text-xs font-mono text-muted-foreground">editor</dt>
                    <dd className="mt-1 text-sm break-words">{publication.editor.join(', ')}</dd>
                  </div>
                ) : null}
                {publication.keywords?.length ? (
                  <div className="rounded-lg border bg-muted/10 p-3">
                    <dt className="text-xs font-mono text-muted-foreground">keywords</dt>
                    <dd className="mt-1 text-sm break-words">{publication.keywords.join(', ')}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          )}
        </div>

        {onEdit && (
          <DialogFooter>
            <Button type="button" className="font-mono" onClick={() => onEdit(publication)}>
              <Pencil className="w-4 h-4 mr-2" />
              edit
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
