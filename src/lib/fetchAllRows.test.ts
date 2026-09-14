import { describe, expect, it, vi } from 'vitest';
import { fetchAllRows } from './fetchAllRows';

describe('fetchAllRows', () => {
  it('returns everything in one page when under the page size', async () => {
    const buildQuery = vi.fn().mockResolvedValue({ data: [1, 2, 3], error: null });
    const { data, error } = await fetchAllRows<number>(buildQuery, 1000);
    expect(data).toEqual([1, 2, 3]);
    expect(error).toBeNull();
    expect(buildQuery).toHaveBeenCalledTimes(1);
    expect(buildQuery).toHaveBeenCalledWith(0, 999);
  });

  it('pages through until a short page ends the loop', async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => i);
    const page2 = Array.from({ length: 3 }, (_, i) => i + 3);
    const page3 = [6];
    const buildQuery = vi.fn()
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null })
      .mockResolvedValueOnce({ data: page3, error: null });

    const { data, error } = await fetchAllRows<number>(buildQuery, 3);

    expect(error).toBeNull();
    expect(data).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(buildQuery).toHaveBeenCalledTimes(3);
    expect(buildQuery).toHaveBeenNthCalledWith(1, 0, 2);
    expect(buildQuery).toHaveBeenNthCalledWith(2, 3, 5);
    expect(buildQuery).toHaveBeenNthCalledWith(3, 6, 8);
  });

  it('stops and surfaces the error without discarding already-fetched rows', async () => {
    const page1 = [1, 2, 3];
    const buildQuery = vi.fn()
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    const { data, error } = await fetchAllRows<number>(buildQuery, 3);

    expect(error).toEqual({ message: 'boom' });
    expect(data).toEqual([1, 2, 3]);
  });

  it('returns an empty array with no query when the first page is already empty', async () => {
    const buildQuery = vi.fn().mockResolvedValue({ data: [], error: null });
    const { data, error } = await fetchAllRows<number>(buildQuery, 1000);
    expect(data).toEqual([]);
    expect(error).toBeNull();
    expect(buildQuery).toHaveBeenCalledTimes(1);
  });
});
