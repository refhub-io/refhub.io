import { lazy, Suspense } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Publication, PublicationRelation, Tag, PublicationTag } from '@/types/database';

const RelationshipGraphPanel = lazy(() =>
  import('./RelationshipGraph').then((m) => ({ default: m.RelationshipGraphPanel }))
);
const PublicationTimeline = lazy(() =>
  import('./PublicationTimeline').then((m) => ({ default: m.PublicationTimeline }))
);
const TagTreemap = lazy(() =>
  import('./TagTreemap').then((m) => ({ default: m.TagTreemap }))
);

interface CollectionAnalyticsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publications: Publication[];
  relations: PublicationRelation[];
  tags: Tag[];
  publicationTags: PublicationTag[];
  onSelectPublication?: (publication: Publication) => void;
}

function PanelFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
      // loading...
    </div>
  );
}

export function CollectionAnalytics({
  open,
  onOpenChange,
  publications,
  relations,
  tags,
  publicationTags,
  onSelectPublication,
}: CollectionAnalyticsProps) {
  const pubsWithYear = publications.filter((p) => p.year != null).length;
  const relCount = relations.length;
  const tagCount = tags.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] sm:h-[92vh] flex flex-col bg-card/95 backdrop-blur-xl border-2 p-3 sm:p-5">
        <DialogHeader className="pb-1 shrink-0">
          <DialogTitle className="text-lg sm:text-xl font-bold flex flex-col sm:flex-row items-start sm:items-center gap-2 font-mono">
            <span className="whitespace-nowrap">// collection_analytics</span>
            <Badge variant="outline" className="font-mono text-xs whitespace-nowrap">
              {publications.length}_papers • {relCount}_links • {tagCount}_tags
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Grid layout — graph + tags on top, timeline on bottom */}
        <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-[3fr_2fr] grid-rows-[1fr_auto] sm:grid-rows-[1fr_200px] gap-3">
          {/* Top-left: relationship graph */}
          <div className="min-h-0 min-w-0 order-1">
            <Suspense fallback={<PanelFallback />}>
              <RelationshipGraphPanel
                publications={publications}
                relations={relations}
                onSelectPublication={onSelectPublication}
              />
            </Suspense>
          </div>

          {/* Top-right: tag treemap */}
          <div className="min-h-0 min-w-0 order-2 sm:order-2 h-[200px] sm:h-auto">
            <Suspense fallback={<PanelFallback />}>
              <TagTreemap tags={tags} publicationTags={publicationTags} />
            </Suspense>
          </div>

          {/* Bottom: timeline (full width) */}
          <div className="min-h-0 min-w-0 order-3 sm:col-span-2 h-[180px] sm:h-auto">
            <Suspense fallback={<PanelFallback />}>
              <PublicationTimeline publications={publications} />
            </Suspense>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
