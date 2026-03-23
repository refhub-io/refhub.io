import { useMemo, useCallback, useRef, useLayoutEffect, useState } from 'react';
import { Tag, PublicationTag } from '@/types/database';

interface TagTreemapProps {
  tags: Tag[];
  publicationTags: PublicationTag[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TreeNode {
  tag: Tag;
  directCount: number;
  totalCount: number;  // directCount + all descendants
  children: TreeNode[];
}

interface RenderItem {
  rect: Rect;
  node: TreeNode;
  depth: number;
  isLeaf: boolean;
}

// Parse color string to HSL values
function parseToHSL(color: string): { h: number; s: number; l: number } {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }
  const hslMatch = color.match(/hsl\((\d+),?\s*(\d+)%?,?\s*(\d+)%?\)/);
  if (hslMatch) {
    return { h: parseInt(hslMatch[1]), s: parseInt(hslMatch[2]), l: parseInt(hslMatch[3]) };
  }
  return { h: 262, s: 83, l: 65 };
}

// Squarified treemap layout (Bruls, Huizing, van Wijk 2000)
function worstAspect(sizes: number[], start: number, end: number, shortSide: number, totalArea: number): number {
  const rowLen = totalArea / shortSide;
  let worst = 0;
  for (let i = start; i < end; i++) {
    const s = sizes[i] / rowLen;
    worst = Math.max(worst, Math.max(rowLen / s, s / rowLen));
  }
  return worst;
}

function layoutSquarified(sizes: number[], rects: Rect[], start: number, x: number, y: number, w: number, h: number) {
  const n = sizes.length - start;
  if (n <= 0) return;
  if (n === 1) {
    rects[start] = { x, y, w, h };
    return;
  }

  const shortSide = Math.min(w, h);
  const totalArea = sizes.slice(start).reduce((a, b) => a + b, 0);

  let rowEnd = start;
  let rowArea = 0;
  let prevWorst = Infinity;

  while (rowEnd < sizes.length) {
    const newArea = rowArea + sizes[rowEnd];
    const newWorst = worstAspect(sizes, start, rowEnd + 1, shortSide, newArea);
    if (newWorst > prevWorst && rowEnd > start) break;
    rowArea = newArea;
    prevWorst = newWorst;
    rowEnd++;
  }

  const fraction = rowArea / totalArea;
  const isHoriz = w >= h;

  if (isHoriz) {
    const rowW = w * fraction;
    let cy = y;
    for (let i = start; i < rowEnd; i++) {
      const itemH = (sizes[i] / rowArea) * h;
      rects[i] = { x, y: cy, w: rowW, h: itemH };
      cy += itemH;
    }
    layoutSquarified(sizes, rects, rowEnd, x + rowW, y, w - rowW, h);
  } else {
    const rowH = h * fraction;
    let cx = x;
    for (let i = start; i < rowEnd; i++) {
      const itemW = (sizes[i] / rowArea) * w;
      rects[i] = { x: cx, y, w: itemW, h: rowH };
      cx += itemW;
    }
    layoutSquarified(sizes, rects, rowEnd, x, y + rowH, w, h - rowH);
  }
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Build tree from flat tag list + publication counts
function buildTree(tags: Tag[], publicationTags: PublicationTag[]): TreeNode[] {
  const countMap = new Map<string, number>();
  publicationTags.forEach((pt) => {
    countMap.set(pt.tag_id, (countMap.get(pt.tag_id) || 0) + 1);
  });

  const childrenMap = new Map<string, Tag[]>();
  tags.forEach((t) => {
    if (t.parent_id) {
      const list = childrenMap.get(t.parent_id) || [];
      list.push(t);
      childrenMap.set(t.parent_id, list);
    }
  });

  function buildNode(tag: Tag): TreeNode {
    const children = (childrenMap.get(tag.id) || []).map(buildNode);
    const directCount = countMap.get(tag.id) || 0;
    const childTotal = children.reduce((s, c) => s + c.totalCount, 0);
    return { tag, directCount, totalCount: directCount + childTotal, children };
  }

  return tags
    .filter((t) => !t.parent_id)
    .map(buildNode)
    .filter((n) => n.totalCount > 0)
    .sort((a, b) => b.totalCount - a.totalCount);
}

// Collect render items depth-first, parents before children
function collectItems(
  nodes: TreeNode[],
  x: number,
  y: number,
  w: number,
  h: number,
  depth: number,
  items: RenderItem[]
) {
  if (nodes.length === 0 || w < 1 || h < 1) return;

  const total = nodes.reduce((s, n) => s + n.totalCount, 0);
  if (total === 0) return;

  const area = w * h;
  const sizes = nodes.map((n) => (n.totalCount / total) * area);
  const rects: Rect[] = new Array(nodes.length);
  layoutSquarified(sizes, rects, 0, x, y, w, h);

  nodes.forEach((node, i) => {
    const rect = rects[i];
    const isLeaf = node.children.length === 0;
    items.push({ rect, node, depth, isLeaf });

    if (!isLeaf) {
      // Reserve a header strip for the parent label
      const pad = 2;
      const headerH = Math.min(22, Math.max(14, rect.h * 0.18));
      collectItems(
        node.children,
        rect.x + pad,
        rect.y + headerH,
        Math.max(rect.w - pad * 2, 0),
        Math.max(rect.h - headerH - pad, 0),
        depth + 1,
        items
      );
    }
  });
}

export function TagTreemap({ tags, publicationTags }: TagTreemapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredItem, setHoveredItem] = useState<{ name: string; count: number; total: number; x: number; y: number } | null>(null);
  const layoutRef = useRef<RenderItem[]>([]);

  const rootNodes = useMemo(() => buildTree(tags, publicationTags), [tags, publicationTags]);

  useLayoutEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) setDimensions({ width, height });
    };
    const id = setTimeout(updateDimensions, 50);
    const ro = new ResizeObserver(updateDimensions);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { clearTimeout(id); ro.disconnect(); };
  }, []);

  useLayoutEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0 || rootNodes.length === 0) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;

    // Collect all render items
    const items: RenderItem[] = [];
    collectItems(rootNodes, 0, 0, width, height, 0, items);
    layoutRef.current = items;

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const outerGap = 2;

    // Render parents first (background), then leaves on top
    const parents = items.filter((it) => !it.isLeaf);
    const leaves = items.filter((it) => it.isLeaf);

    // Draw parent containers
    parents.forEach(({ rect, node }) => {
      const x = rect.x + outerGap / 2;
      const y = rect.y + outerGap / 2;
      const w = Math.max(rect.w - outerGap, 0);
      const h = Math.max(rect.h - outerGap, 0);
      if (w < 1 || h < 1) return;

      const tagColor = node.tag.color || '#8b5cf6';
      const hsl = parseToHSL(tagColor);
      const r = Math.min(5, w / 4, h / 4);

      // Background fill
      ctx.fillStyle = tagColor;
      ctx.globalAlpha = 0.12;
      drawRoundedRect(ctx, x, y, w, h, r);
      ctx.fill();

      // Border
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = tagColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Header label (top-left)
      if (w > 30 && h > 16) {
        const fontSize = Math.min(11, Math.max(9, w / 12));
        ctx.font = `bold ${fontSize}px "JetBrains Mono", monospace`;
        ctx.fillStyle = `hsl(${hsl.h}, ${Math.max(hsl.s, 50)}%, 72%)`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const label = node.tag.name.toLowerCase().replace(/ /g, '_');
        const pad = 5;
        const maxW = w - pad * 2 - 30; // leave room for count
        let display = label;
        while (display.length > 2 && ctx.measureText(display + '…').width > maxW) {
          display = display.slice(0, -1);
        }
        if (display !== label) display += '…';
        ctx.fillText(display, x + pad, y + pad);

        // Count badge (top-right)
        ctx.fillStyle = `hsl(${hsl.h}, ${Math.max(hsl.s, 50)}%, 55%)`;
        ctx.font = `${Math.max(8, fontSize - 1)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(`${node.totalCount}`, x + w - pad, y + pad);
        ctx.textAlign = 'left';
      }
    });

    // Draw leaf nodes
    leaves.forEach(({ rect, node }) => {
      const x = rect.x + outerGap / 2;
      const y = rect.y + outerGap / 2;
      const w = Math.max(rect.w - outerGap, 0);
      const h = Math.max(rect.h - outerGap, 0);
      if (w < 1 || h < 1) return;

      const tagColor = node.tag.color || '#8b5cf6';
      const hsl = parseToHSL(tagColor);
      const r = Math.min(4, w / 4, h / 4);

      ctx.fillStyle = tagColor;
      ctx.globalAlpha = 0.22;
      drawRoundedRect(ctx, x, y, w, h, r);
      ctx.fill();

      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = tagColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (w > 40 && h > 20) {
        const fontSize = Math.min(12, Math.max(9, w / 10));
        ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
        ctx.fillStyle = `hsl(${hsl.h}, ${Math.max(hsl.s, 50)}%, 75%)`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const label = node.tag.name.toLowerCase().replace(/ /g, '_');
        const pad = 6;
        const maxW = w - pad * 2;
        let display = label;
        while (display.length > 2 && ctx.measureText(display + '…').width > maxW) {
          display = display.slice(0, -1);
        }
        if (display !== label) display += '…';
        ctx.fillText(display, x + pad, y + pad);

        if (h > 36) {
          ctx.fillStyle = 'hsl(240, 5%, 55%)';
          ctx.font = `${Math.max(8, fontSize - 2)}px "JetBrains Mono", monospace`;
          ctx.fillText(`${node.totalCount}_papers`, x + pad, y + pad + fontSize + 2);
        }
      }
    });
  }, [dimensions, rootNodes]);

  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cr = canvas.getBoundingClientRect();
    const mx = e.clientX - cr.left;
    const my = e.clientY - cr.top;

    // Find the deepest (most specific) item under the cursor
    const hits = layoutRef.current.filter(
      ({ rect }) => mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h
    );
    const hit = hits.length > 0 ? hits[hits.length - 1] : null;

    if (hit) {
      let tx = e.clientX + 12;
      let ty = e.clientY - 10;
      const tip = tooltipRef.current;
      if (tip) {
        if (tx + tip.offsetWidth > window.innerWidth - 8) tx = e.clientX - tip.offsetWidth - 12;
        if (ty + tip.offsetHeight > window.innerHeight - 8) ty = e.clientY - tip.offsetHeight - 4;
        if (ty < 8) ty = 8;
      }
      setHoveredItem({
        name: hit.node.tag.name.toLowerCase().replace(/ /g, '_'),
        count: hit.node.directCount,
        total: hit.node.totalCount,
        x: tx,
        y: ty,
      });
    } else {
      setHoveredItem(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => setHoveredItem(null), []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <span className="text-sm font-mono text-muted-foreground pb-2">// tags</span>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 rounded-lg bg-background/50 border relative overflow-hidden"
      >
        {rootNodes.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
            // no tags assigned yet
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />
            {hoveredItem && (
              <div
                ref={tooltipRef}
                className="fixed z-50 rounded-lg border border-border/50 bg-background px-3 py-2 shadow-xl pointer-events-none"
                style={{ left: hoveredItem.x, top: hoveredItem.y }}
              >
                <p className="font-mono text-xs text-foreground">{hoveredItem.name}</p>
                {hoveredItem.count !== hoveredItem.total ? (
                  <>
                    <p className="font-mono text-[10px] text-muted-foreground">{hoveredItem.total}_total_papers</p>
                    <p className="font-mono text-[10px] text-muted-foreground/60">{hoveredItem.count}_direct</p>
                  </>
                ) : (
                  <p className="font-mono text-[10px] text-muted-foreground">{hoveredItem.total}_papers</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
