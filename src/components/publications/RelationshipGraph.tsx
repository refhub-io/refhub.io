import { useRef, useEffect, useCallback, useMemo, useState, useLayoutEffect } from 'react';
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
  cites: '#22c55e',
  extends: '#3b82f6',
  contradicts: '#ef4444',
  reviews: '#f97316',
  builds_on: '#8b5cf6',
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
  const hasZoomedRef = useRef(false);

  // Track container dimensions
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isReady, setIsReady] = useState(false);

  // Measure container after layout
  useLayoutEffect(() => {
    if (!open) {
      setIsReady(false);
      setDimensions({ width: 0, height: 0 });
      return;
    }

    const updateDimensions = () => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
        setIsReady(true);
      }
    };

    // Measure after a brief delay to ensure dialog is fully rendered
    const timeoutId = setTimeout(updateDimensions, 100);

    // Also set up resize observer for window resizes
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [open]);

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

    // Build nodes - prefer bibkey for labels, fallback to shortened title
    const nodes: GraphNode[] = connectedPubs.map((pub) => ({
      id: pub.id,
      name: pub.bibtex_key || (pub.title.length > 20 ? pub.title.slice(0, 20) + '...' : pub.title),
      year: pub.year,
      authors: pub.authors,
      val: 1,
    }));

    // Build links
    const links: GraphLink[] = relations.map((rel) => ({
      source: rel.publication_id,
      target: rel.related_publication_id,
      type: rel.relation_type,
      color: RELATION_COLORS[rel.relation_type] || RELATION_COLORS.cites,
    }));

    return { nodes, links };
  }, [publications, relations]);

  // Center graph after it loads
  useEffect(() => {
    if (open && graphData.nodes.length > 0) {
      hasZoomedRef.current = false;
    }
  }, [open, graphData.nodes.length]);

  // Handle zoom to fit when engine stops - primary centering method
  const handleEngineStop = useCallback(() => {
    if (!hasZoomedRef.current && graphRef.current) {
      hasZoomedRef.current = true;
      // Use more padding on mobile to prevent label clipping in constrained width
      const padding = dimensions.width < 640 ? 100 : 120;
      graphRef.current.zoomToFit(400, padding);
    }
  }, [dimensions.width]);

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
    (node: { name: string; x: number; y: number }, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name;
      const fontSize = Math.max(10 / globalScale, 3);
      ctx.font = `${fontSize}px "SF Mono", Monaco, monospace`;
      
      // Node circle - smaller
      const nodeRadius = 4;
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = 'hsl(260, 80%, 60%)';
      ctx.fill();
      ctx.strokeStyle = 'hsl(260, 80%, 80%)';
      ctx.lineWidth = 1.2 / globalScale;
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
      <DialogContent className="max-w-6xl w-[95vw] h-[85vh] sm:h-[90vh] flex flex-col bg-card/95 backdrop-blur-xl border-2 p-3 sm:p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg sm:text-xl font-bold flex flex-col sm:flex-row items-start sm:items-center gap-2 font-mono">
            <span className="whitespace-nowrap">// graph</span>
            <Badge variant="outline" className="font-mono text-xs whitespace-nowrap">
              {graphData.nodes.length}_papers • {graphData.links.length}_links
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 px-1 pb-2">
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

        <div ref={containerRef} className="flex-1 min-h-0 w-full rounded-lg overflow-hidden bg-background/50 border">
          {graphData.nodes.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
              // no paper relationships to visualize yet
            </div>
          ) : !isReady || dimensions.width === 0 || dimensions.height === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
              // loading graph...
            </div>
          ) : (
            <ForceGraph2D
              key={`graph-${dimensions.width}-${dimensions.height}`}
              ref={graphRef}
              graphData={graphData}
              width={dimensions.width}
              height={dimensions.height}
              nodeCanvasObject={nodeCanvasObject}
              linkCanvasObject={linkCanvasObject}
              onNodeClick={handleNodeClick}
              nodePointerAreaPaint={(node, color, ctx) => {
                ctx.beginPath();
                ctx.arc(node.x!, node.y!, 12, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
              }}
              onEngineStop={handleEngineStop}
              warmupTicks={100}
              cooldownTicks={200}
              d3AlphaDecay={0.01}
              d3VelocityDecay={0.2}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={1}
              linkDirectionalArrowColor={(link: GraphLink) => link.color}
              enableNodeDrag={true}
              enableZoomInteraction={true}
              enablePanInteraction={true}
              backgroundColor="transparent"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
