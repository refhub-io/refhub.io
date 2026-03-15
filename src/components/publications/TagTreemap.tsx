import { useMemo, useCallback, useRef, useLayoutEffect, useState } from 'react';
import { Tag, PublicationTag } from '@/types/database';

interface TagTreemapProps {
  tags: Tag[];
  publicationTags: PublicationTag[];
}

interface TagItem {
  tag: Tag;
  count: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
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
  return { h: 262, s: 83, l: 65 }; // default purple
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

export function TagTreemap({ tags, publicationTags }: TagTreemapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredTag, setHoveredTag] = useState<{ name: string; count: number; x: number; y: number } | null>(null);
  const layoutRef = useRef<{ rect: Rect; item: TagItem }[]>([]);

  // Flat list of tags with direct publication counts (no recursive accumulation)
  const tagItems = useMemo(() => {
    const countMap = new Map<string, number>();
    publicationTags.forEach((pt) => {
      countMap.set(pt.tag_id, (countMap.get(pt.tag_id) || 0) + 1);
    });
    return tags
      .map((tag) => ({ tag, count: countMap.get(tag.id) || 0 }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [tags, publicationTags]);

  // Measure container
  useLayoutEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    };

    const timeoutId = setTimeout(updateDimensions, 50);
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, []);

  // Layout and render
  useLayoutEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0 || tagItems.length === 0) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;

    // Compute squarified treemap layout
    const totalCount = tagItems.reduce((s, t) => s + t.count, 0);
    const area = width * height;
    const sizes = tagItems.map((t) => (t.count / totalCount) * area);
    const rects: Rect[] = new Array(tagItems.length);
    layoutSquarified(sizes, rects, 0, 0, 0, width, height);

    layoutRef.current = tagItems.map((item, i) => ({ rect: rects[i], item }));

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

    const gap = 2;

    layoutRef.current.forEach(({ rect, item }) => {
      const x = rect.x + gap / 2;
      const y = rect.y + gap / 2;
      const w = Math.max(rect.w - gap, 0);
      const h = Math.max(rect.h - gap, 0);

      if (w < 1 || h < 1) return;

      const tagColor = item.tag.color || '#8b5cf6';
      const hsl = parseToHSL(tagColor);
      const r = Math.min(4, w / 4, h / 4);

      // Fill: tag color at low opacity over dark bg
      ctx.fillStyle = tagColor;
      ctx.globalAlpha = 0.18;
      drawRoundedRect(ctx, x, y, w, h, r);
      ctx.fill();

      // Border: tag color
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = tagColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.globalAlpha = 1;

      // Label: tinted with tag hue
      if (w > 40 && h > 20) {
        const fontSize = Math.min(12, Math.max(9, w / 10));
        ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
        ctx.fillStyle = `hsl(${hsl.h}, ${Math.max(hsl.s, 50)}%, 75%)`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const label = item.tag.name.toLowerCase().replace(/ /g, '_');
        const padding = 6;

        let displayLabel = label;
        const maxLabelWidth = w - padding * 2;
        if (ctx.measureText(displayLabel).width > maxLabelWidth) {
          while (displayLabel.length > 3 && ctx.measureText(displayLabel + '…').width > maxLabelWidth) {
            displayLabel = displayLabel.slice(0, -1);
          }
          displayLabel += '…';
        }

        ctx.fillText(displayLabel, x + padding, y + padding);

        if (h > 36) {
          ctx.fillStyle = 'hsl(240, 5%, 55%)';
          ctx.font = `${Math.max(8, fontSize - 2)}px "JetBrains Mono", monospace`;
          ctx.fillText(`${item.count}_papers`, x + padding, y + padding + fontSize + 2);
        }
      }
    });
  }, [dimensions, tagItems]);

  const tooltipRef = useRef<HTMLDivElement>(null);

  // Handle mouse move for tooltip
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const mx = e.clientX - canvasRect.left;
    const my = e.clientY - canvasRect.top;

    const hit = layoutRef.current.find(
      ({ rect }) => mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h
    );

    if (hit) {
      let tx = e.clientX + 12;
      let ty = e.clientY - 10;

      // Clamp to viewport
      const tip = tooltipRef.current;
      if (tip) {
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        if (tx + tw > window.innerWidth - 8) tx = e.clientX - tw - 12;
        if (ty + th > window.innerHeight - 8) ty = e.clientY - th - 4;
        if (ty < 8) ty = 8;
      }

      setHoveredTag({
        name: hit.item.tag.name.toLowerCase().replace(/ /g, '_'),
        count: hit.item.count,
        x: tx,
        y: ty,
      });
    } else {
      setHoveredTag(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => setHoveredTag(null), []);

  const hasData = tagItems.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <span className="text-sm font-mono text-muted-foreground pb-2">// tags</span>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 rounded-lg bg-background/50 border relative overflow-hidden"
      >
        {!hasData ? (
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
            {hoveredTag && (
              <div
                ref={tooltipRef}
                className="fixed z-50 rounded-lg border border-border/50 bg-background px-3 py-2 shadow-xl pointer-events-none"
                style={{
                  left: hoveredTag.x,
                  top: hoveredTag.y,
                }}
              >
                <p className="font-mono text-xs text-foreground">{hoveredTag.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{hoveredTag.count}_papers</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
