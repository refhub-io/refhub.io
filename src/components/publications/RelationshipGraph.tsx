import { useRef, useEffect, useCallback, useMemo, useState, useLayoutEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { Publication, PublicationRelation, RELATION_TYPES } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { forceX, forceY, forceManyBody } from 'd3-force-3d';

interface GraphNode {
  id: string;
  name: string;
  year?: number | null;
  authors?: string[];
  val: number;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
  color: string;
}

// Type for link object after it's been transformed by the force graph library
interface TransformedGraphLink {
  source: { x: number; y: number };
  target: { x: number; y: number };
  type: string;
  color: string;
}

export interface RelationshipGraphPanelProps {
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

export function RelationshipGraphPanel({
  publications,
  relations,
  onSelectPublication,
}: RelationshipGraphPanelProps) {
  const graphRef = useRef<ForceGraphMethods>();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasZoomedRef = useRef(false);

  // Track container dimensions
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isReady, setIsReady] = useState(false);

  // Measure container after layout
  useLayoutEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
        setIsReady(true);
      }
    };

    const timeoutId = setTimeout(updateDimensions, 100);

    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, []);

  // Build graph data
  const graphData = useMemo(() => {
    const connectedIds = new Set<string>();
    relations.forEach((rel) => {
      connectedIds.add(rel.publication_id);
      connectedIds.add(rel.related_publication_id);
    });

    const connectedPubs = publications.filter((pub) => connectedIds.has(pub.id));

    const nodes: GraphNode[] = connectedPubs.map((pub) => ({
      id: pub.id,
      name: pub.bibtex_key || (pub.title.length > 20 ? pub.title.slice(0, 20) + '...' : pub.title),
      year: pub.year,
      authors: pub.authors,
      val: 1,
    }));

    const links: GraphLink[] = relations.map((rel) => ({
      source: rel.publication_id,
      target: rel.related_publication_id,
      type: rel.relation_type,
      color: RELATION_COLORS[rel.relation_type] || RELATION_COLORS.cites,
    }));

    return { nodes, links };
  }, [publications, relations]);

  // Apply center-pulling forces to keep disconnected components together
  useEffect(() => {
    if (!graphRef.current || graphData.nodes.length === 0) return;

    const fg = graphRef.current;
    fg.d3Force('x', forceX(0).strength(0.15));
    fg.d3Force('y', forceY(0).strength(0.15));
    fg.d3Force('charge', forceManyBody().strength(-80));
    fg.d3ReheatSimulation();
  }, [graphData]);

  // Reset zoom flag when data changes significantly
  useEffect(() => {
    hasZoomedRef.current = false;
  }, [publications, relations]);

  const handleEngineStop = useCallback(() => {
    if (!hasZoomedRef.current && graphRef.current) {
      hasZoomedRef.current = true;
      const padding = dimensions.width < 640 ? 60 : 80;
      graphRef.current.zoomToFit(400, padding);
    }
  }, [dimensions.width]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const pub = publications.find((p) => p.id === node.id);
      if (pub && onSelectPublication) {
        onSelectPublication(pub);
      }
    },
    [publications, onSelectPublication]
  );

  const nodeCanvasObject = useCallback(
    (node: { name: string; x: number; y: number }, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name;
      const fontSize = Math.max(10 / globalScale, 3);
      ctx.font = `${fontSize}px "SF Mono", Monaco, monospace`;
      
      const nodeRadius = 4;
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = 'hsl(260, 80%, 60%)';
      ctx.fill();
      ctx.strokeStyle = 'hsl(260, 80%, 80%)';
      ctx.lineWidth = 1.2 / globalScale;
      ctx.stroke();

      const textWidth = ctx.measureText(label).width;
      const bckgDimensions = [textWidth + 4, fontSize + 2].map((n) => n);
      
      ctx.fillStyle = 'hsla(240, 10%, 10%, 0.85)';
      ctx.fillRect(
        node.x - bckgDimensions[0] / 2,
        node.y + nodeRadius + 2,
        bckgDimensions[0],
        bckgDimensions[1]
      );

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'hsl(0, 0%, 95%)';
      ctx.fillText(label, node.x, node.y + nodeRadius + 3);
    },
    []
  );

  const linkCanvasObject = useCallback(
    (link: TransformedGraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const start = link.source;
      const end = link.target;

      if (typeof start !== 'object' || typeof end !== 'object') return;

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = link.color;
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();

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
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="text-sm font-mono text-muted-foreground whitespace-nowrap">// graph</span>
        <div className="flex flex-wrap gap-2">
          {RELATION_TYPES.map((type) => (
            <div key={type.value} className="flex items-center gap-1">
              <div
                className="w-2.5 h-0.5 rounded-full"
                style={{ backgroundColor: RELATION_COLORS[type.value] }}
              />
              <span className="text-[10px] text-muted-foreground font-mono">{type.label.toLowerCase().replace(/ /g, '_')}</span>
            </div>
          ))}
        </div>
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
    </div>
  );
}
