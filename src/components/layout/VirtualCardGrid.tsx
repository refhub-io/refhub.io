import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { DEFAULT_GRID_COLUMNS, chunkIntoRows, useColumnCount, type GridColumns } from '@/hooks/useColumnCount';

interface VirtualCardGridProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  columns?: GridColumns;
  /** A row's height before it's measured. */
  estimateRowHeight?: number;
  /** Space between rows and between columns, in px (gap-6 by default). */
  gapPx?: number;
  /** Called while the last rows are on screen, to load the next page. It must ignore repeat calls while loading. */
  onEndReached?: () => void;
  className?: string;
}

/**
 * A grid of cards that mounts only the rows on screen. The document scrolls, not the grid, as with
 * the paper list's cards: pages put it in a min-h-screen layout. Each row is its own grid, so the
 * cards in a row still stretch to the tallest one.
 */
export function VirtualCardGrid<T>({
  items,
  getKey,
  renderItem,
  columns = DEFAULT_GRID_COLUMNS,
  estimateRowHeight = 320,
  gapPx = 24,
  onEndReached,
  className,
}: VirtualCardGridProps<T>) {
  const columnCount = useColumnCount(columns);
  const rows = useMemo(() => chunkIntoRows(items, columnCount), [items, columnCount]);
  const containerRef = useRef<HTMLDivElement>(null);
  // Where the grid starts in the document. Whatever sits above it can change height, and so can
  // the window; both resize the body.
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setOffset(el.getBoundingClientRect().top + window.scrollY);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => estimateRowHeight,
    overscan: 3,
    scrollMargin: offset,
    // A row's key is its cards': a new column count or a new page regroups the cards.
    getItemKey: (index) => rows[index]?.map(getKey).join('|') ?? index,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const lastShownRow = virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].index : -1;

  useEffect(() => {
    if (onEndReached && rows.length > 0 && lastShownRow >= rows.length - 2) onEndReached();
  }, [onEndReached, lastShownRow, rows.length]);

  return (
    <div ref={containerRef} className={cn('relative w-full', className)} style={{ height: virtualizer.getTotalSize() }}>
      {virtualRows.map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute left-0 top-0 w-full"
          style={{
            transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
            paddingBottom: row.index === rows.length - 1 ? 0 : gapPx,
          }}
        >
          <div className="grid" style={{ gap: gapPx, gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
            {rows[row.index].map((item) => (
              <Fragment key={getKey(item)}>{renderItem(item)}</Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
