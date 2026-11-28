import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualCardGrid } from './VirtualCardGrid';
import { chunkIntoRows } from '@/hooks/useColumnCount';

const originalMatchMedia = window.matchMedia;

function viewportAtLeast(minWidth: number) {
  window.matchMedia = ((query: string) => ({
    matches: Number(/min-width: (\d+)px/.exec(query)?.[1] ?? Infinity) <= minWidth,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

const items = Array.from({ length: 7 }, (_, i) => ({ id: `card-${i}` }));

describe('chunkIntoRows', () => {
  it('fills rows left to right, the last one partly', () => {
    expect(chunkIntoRows([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(chunkIntoRows([], 3)).toEqual([]);
  });
});

describe('VirtualCardGrid', () => {
  const renderGrid = (onEndReached?: () => void) =>
    render(
      <VirtualCardGrid
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <div data-testid="card">{item.id}</div>}
        onEndReached={onEndReached}
      />,
    );

  it('puts three cards in a row on a wide screen, two on a medium one, one on a narrow one', () => {
    for (const [width, perRow] of [[1400, 3], [900, 2], [500, 1]] as const) {
      viewportAtLeast(width);
      const { container, unmount } = renderGrid();
      const firstRow = container.querySelector('[data-index="0"] > div');
      expect(firstRow?.children).toHaveLength(perRow);
      expect((firstRow as HTMLElement).style.gridTemplateColumns).toBe(`repeat(${perRow}, minmax(0, 1fr))`);
      unmount();
    }
  });

  it('renders the cards in order', () => {
    viewportAtLeast(1400);
    renderGrid();
    expect(screen.getAllByTestId('card').map((card) => card.textContent)).toEqual(items.map((item) => item.id));
  });

  it('asks for more once the last rows are on screen', () => {
    viewportAtLeast(1400);
    const onEndReached = vi.fn();
    renderGrid(onEndReached);
    expect(onEndReached).toHaveBeenCalled();
  });
});
