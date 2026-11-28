import { useSyncExternalStore } from 'react';

/** Columns per breakpoint, by viewport width like Tailwind's: base, md (768px) and xl (1280px). */
export interface GridColumns {
  base: number;
  md: number;
  xl: number;
}

export const DEFAULT_GRID_COLUMNS: GridColumns = { base: 1, md: 2, xl: 3 };
const MD = '(min-width: 768px)';
const XL = '(min-width: 1280px)';

function subscribeToBreakpoints(onChange: () => void): () => void {
  const queries = [window.matchMedia(MD), window.matchMedia(XL)];
  queries.forEach((q) => q.addEventListener?.('change', onChange));
  return () => queries.forEach((q) => q.removeEventListener?.('change', onChange));
}

/** How many columns the grid has at the current viewport width. */
export function useColumnCount(columns: GridColumns = DEFAULT_GRID_COLUMNS): number {
  return useSyncExternalStore(
    subscribeToBreakpoints,
    () => (window.matchMedia(XL).matches ? columns.xl : window.matchMedia(MD).matches ? columns.md : columns.base),
    () => columns.base,
  );
}

export function chunkIntoRows<T>(items: T[], columnCount: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columnCount) rows.push(items.slice(i, i + columnCount));
  return rows;
}
