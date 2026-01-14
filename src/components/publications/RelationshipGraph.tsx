import { useRef, useEffect, useCallback, useMemo } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { Publication, PublicationRelation, RELATION_TYPES } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface GraphNode {
  id: string;
  name: string;
  year?: number | null;
  authors?: string[];
  val: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
  color: string;
}

interface RelationshipGraphProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publications: Publication[];
  relations: PublicationRelation[];
  onSelectPublication?: (publication: Publication) => void;
}

const RELATION_COLORS: Record<string, string> = {
  related: '#6366f1',
  cites: '#22c55e',
  extends: '#3b82f6',
  contradicts: '#ef4444',
  reviews: '#f97316',
  builds_on: '#8b5cf6',
  supersedes: '#ec4899',
};

export function RelationshipGraph({
  open,
  onOpenChange,
  publications,
  relations,
  onSelectPublication,
}: RelationshipGraphProps) {
  const graphRef = useRef<ForceGraphMethods>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Build graph data
  const graphData = useMemo(() => {
    // Get all publication IDs that have relations
    const connectedIds = new Set<string>();
    relations.forEach((rel) => {
      connectedIds.add(rel.publication_id);
      connectedIds.add(rel.related_publication_id);
    });

    // Filter publications to only those with connections
    const connectedPubs = publications.filter((pub) => connectedIds.has(pub.id));

    // Build nodes
    const nodes: GraphNode[] = connectedPubs.map((pub) => ({
      id: pub.id,
      name: pub.title.length > 40 ? pub.title.slice(0, 40) + '...' : pub.title,
      year: pub.year,
      authors: pub.authors,
      val: 1,
    }));

    // Build links
    const links: GraphLink[] = relations.map((rel) => ({
      source: rel.publication_id,
      target: rel.related_publication_id,
      type: rel.relation_type,
      color: RELATION_COLORS[rel.relation_type] || RELATION_COLORS.related,
    }));

    return { nodes, links };
  }, [publications, relations]);

  // Fit graph to view on load
  useEffect(() => {
    if (open && graphRef.current && graphData.nodes.length > 0) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 50);
      }, 300);
    }
  }, [open, graphData.nodes.length]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const pub = publications.find((p) => p.id === node.id);
      if (pub && onSelectPublication) {
        onSelectPublication(pub);
        onOpenChange(false);
      }
    },
    [publications, onSelectPublication, onOpenChange]
  );

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name;
      const fontSize = Math.max(12 / globalScale, 3);
      ctx.font = `${fontSize}px "SF Mono", Monaco, monospace`;
      
      // Node circle
      const nodeRadius = 6;
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = 'hsl(260, 80%, 60%)';
      ctx.fill();
      ctx.strokeStyle = 'hsl(260, 80%, 80%)';
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();

      // Label background
      const textWidth = ctx.measureText(label).width;
      const bckgDimensions = [textWidth + 4, fontSize + 2].map((n) => n);
      
      ctx.fillStyle = 'hsla(240, 10%, 10%, 0.85)';
      ctx.fillRect(
        node.x - bckgDimensions[0] / 2,
        node.y + nodeRadius + 2,
        bckgDimensions[0],
        bckgDimensions[1]
      );

      // Label text
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'hsl(0, 0%, 95%)';
      ctx.fillText(label, node.x, node.y + nodeRadius + 3);
    },
    []
  );

  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const start = link.source;
      const end = link.target;

      if (typeof start !== 'object' || typeof end !== 'object') return;

      // Draw line
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = link.color;
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();

      // Draw label at midpoint
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const label = RELATION_TYPES.find((t) => t.value === link.type)?.label || link.type;
      
      const fontSize = Math.max(10 / globalScale, 2);
      ctx.font = `${fontSize}px "SF Mono", Monaco, monospace`;
      
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = 'hsla(240, 10%, 8%, 0.9)';
      ctx.fillRect(midX - textWidth / 2 - 2, midY - fontSize / 2 - 1, textWidth + 4, fontSize + 2);
      
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = link.color;
      ctx.fillText(label, midX, midY);
    },
    []
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col bg-card/95 backdrop-blur-xl border-2">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 font-mono">
            // paper_relationship_graph
            <Badge variant="outline" className="font-mono text-xs">
              {graphData.nodes.length}_papers • {graphData.links.length}_links
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 px-1">
          {RELATION_TYPES.map((type) => (
            <div key={type.value} className="flex items-center gap-1.5">
              <div
                className="w-3 h-0.5 rounded-full"
                style={{ backgroundColor: RELATION_COLORS[type.value] }}
              />
              <span className="text-xs text-muted-foreground font-mono">{type.label.toLowerCase().replace(/ /g, '_')}</span>
            </div>
          ))}
        </div>

        <div ref={containerRef} className="flex-1 rounded-lg overflow-hidden bg-background/50 border">
          {graphData.nodes.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
              // no paper relationships to visualize yet
            </div>
          ) : (
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              nodeCanvasObject={nodeCanvasObject}
              linkCanvasObject={linkCanvasObject}
              onNodeClick={handleNodeClick}
              nodePointerAreaPaint={(node, color, ctx) => {
                ctx.beginPath();
                ctx.arc(node.x!, node.y!, 12, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
              }}
              cooldownTicks={100}
              linkDirectionalParticles={0}
              enableNodeDrag={true}
              enableZoomInteraction={true}
              enablePanInteraction={true}
              backgroundColor="transparent"
              width={containerRef.current?.clientWidth || 800}
              height={(containerRef.current?.clientHeight || 500) - 20}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
