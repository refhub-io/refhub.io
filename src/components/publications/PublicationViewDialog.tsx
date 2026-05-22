import { Publication, PublicationRelation, RELATION_TYPES, Tag } from '@/types/database';
import { formatTimeAgo } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HierarchicalTagBadge } from '@/components/tags/HierarchicalTagBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, ExternalLink, FileText, Link2, Loader2, Pencil } from 'lucide-react';
import { GoogleDriveIcon } from '@/components/ui/GoogleDriveIcon';

interface PublicationViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publication: Publication | null;
  tags: Tag[];
  allTags: Tag[];
  publications?: Publication[];
  relations?: PublicationRelation[];
  onEdit?: (publication: Publication) => void;
  onExport?: (publication: Publication) => void;
  driveUrl?: string | null;
  driveLoading?: boolean;
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
  publications = [],
  relations = [],
  onEdit,
  onExport,
  driveUrl,
  driveLoading = false,
}: PublicationViewDialogProps) {
  if (!publication) return null;

  const metadata = DETAIL_FIELDS.filter(({ key }) => {
    const value = publication[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

  const relationTypeLabels = new Map(RELATION_TYPES.map((type) => [type.value, type.label]));
  const publicationById = new Map(publications.map((pub) => [pub.id, pub]));
  const relatedPublications = relations
    .map((relation) => {
      const isSource = relation.publication_id === publication.id;
      const isTarget = relation.related_publication_id === publication.id;
      if (!isSource && !isTarget) return null;

      const relatedId = isSource ? relation.related_publication_id : relation.publication_id;
      const relatedPublication = publicationById.get(relatedId);
      if (!relatedPublication) return null;

      return {
        relation,
        relatedPublication,
        direction: isSource ? 'outgoing' : 'incoming',
        label: relationTypeLabels.get(relation.relation_type as never) || relation.relation_type,
      };
    })
    .filter((item): item is {
      relation: PublicationRelation;
      relatedPublication: Publication;
      direction: 'outgoing' | 'incoming';
      label: string;
    } => Boolean(item));

  const hasNotes = Boolean(publication.notes);
  const hasTags = tags.length > 0;
  const hasRelations = relatedPublications.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-mobile publication-view-dialog max-w-[100vw] border-2 bg-card/95 backdrop-blur-xl overflow-hidden shadow-2xl sm:rounded-2xl sm:h-auto sm:w-[95vw] sm:max-w-3xl sm:max-h-[90vh] p-0 gap-0">
        <DialogHeader className="shrink-0 space-y-3 px-4 sm:px-6 pt-[max(env(safe-area-inset-top),1rem)] sm:pt-6 pb-4 border-b border-border/60">
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
          <DialogTitle className="pr-8 text-xl sm:text-2xl font-bold font-mono leading-tight">
            // {publication.title}
          </DialogTitle>
          <DialogDescription className="text-sm font-mono">
            {publication.authors.length > 0 ? publication.authors.join(', ') : 'unknown author'}
            {publication.updated_at && ` • updated ${formatTimeAgo(publication.updated_at)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 sm:space-y-6 px-4 sm:px-6 py-4 sm:py-6">
          {(publication.doi || publication.url || publication.pdf_url || driveLoading || driveUrl) && (
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
              {publication.doi && (
                <Button asChild variant="outline" size="sm" className="w-full justify-start sm:w-auto font-mono">
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
                <Button asChild variant="outline" size="sm" className="w-full justify-start sm:w-auto font-mono">
                  <a href={publication.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    link
                  </a>
                </Button>
              )}
              {publication.pdf_url && (
                <Button asChild variant="outline" size="sm" className="w-full justify-start sm:w-auto font-mono">
                  <a href={publication.pdf_url} target="_blank" rel="noopener noreferrer">
                    <FileText className="w-4 h-4 mr-2" />
                    publisher_pdf
                  </a>
                </Button>
              )}
              {driveLoading && (
                <Button variant="outline" size="sm" className="w-full justify-start sm:w-auto font-mono" disabled>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  drive_pdf
                </Button>
              )}
              {!driveLoading && driveUrl && (
                <Button asChild variant="outline" size="sm" className="w-full justify-start sm:w-auto font-mono">
                  <a href={driveUrl} target="_blank" rel="noopener noreferrer">
                    <GoogleDriveIcon className="w-4 h-4 mr-2" />
                    drive_pdf
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

          {(hasTags || hasRelations || hasNotes) && (
            <Tabs defaultValue={hasRelations ? 'relationships' : hasTags ? 'tags' : 'notes'} className="space-y-3">
              <TabsList className="grid w-full grid-cols-3 font-mono">
                <TabsTrigger value="relationships" disabled={!hasRelations}>relationships</TabsTrigger>
                <TabsTrigger value="tags" disabled={!hasTags}>tags</TabsTrigger>
                <TabsTrigger value="notes" disabled={!hasNotes}>notes</TabsTrigger>
              </TabsList>

              <TabsContent value="relationships" className="space-y-2">
                <h3 className="text-sm font-semibold font-mono">relationships</h3>
                <div className="space-y-2">
                  {relatedPublications.map(({ relation, relatedPublication, direction, label }) => (
                    <div key={relation.id} className="rounded-lg border bg-muted/10 p-3">
                      <div className="flex items-start gap-3">
                        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {direction === 'outgoing' ? label : `is ${label.toLowerCase()} by`}
                            </Badge>
                            {relatedPublication.year && (
                              <Badge variant="secondary" className="font-mono text-xs">
                                {relatedPublication.year}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium leading-snug">{relatedPublication.title}</p>
                          {relatedPublication.authors.length > 0 && (
                            <p className="text-xs text-muted-foreground font-mono">
                              {relatedPublication.authors.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="tags" className="space-y-2">
                <h3 className="text-sm font-semibold font-mono">tags</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <HierarchicalTagBadge key={tag.id} tag={tag} allTags={allTags} size="sm" showHierarchy />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="notes" className="space-y-2">
                <h3 className="text-sm font-semibold font-mono">notes</h3>
                <div className="rounded-lg border bg-muted/20 p-4">
                  <MarkdownRenderer compact>{publication.notes || ''}</MarkdownRenderer>
                </div>
              </TabsContent>
            </Tabs>
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

        {(onEdit || onExport) && (
          <DialogFooter className="shrink-0 border-t border-border/60 px-4 sm:px-6 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:py-4 flex-col-reverse sm:flex-row gap-2">
            {onExport && (
              <Button type="button" variant="outline" className="w-full sm:w-auto font-mono" onClick={() => onExport(publication)}>
                <Download className="w-4 h-4 mr-2" />
                export
              </Button>
            )}
            {onEdit && (
              <Button type="button" className="w-full sm:w-auto font-mono" onClick={() => onEdit(publication)}>
                <Pencil className="w-4 h-4 mr-2" />
                edit
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
