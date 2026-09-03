import { describe, expect, it, vi } from 'vitest';
import { fetchSmartCollections, createSmartCollection, updateSmartCollection, deleteSmartCollection } from './smartCollections';

/**
 * Builds a chainable query mock. `.order()` and `.single()` resolve directly
 * via Promise.resolve(result), which is how fetch/create/update terminate
 * their chains.
 *
 * `deleteSmartCollection` terminates its chain at `.eq()` instead
 * (`.delete().eq(id)`), so `.eq()` must ALSO be awaitable and resolve to
 * `result` — not just return `query` for further chaining. Making `query`
 * itself a genuine thenable (a real `.then()` that delegates to
 * `Promise.resolve(result)`) satisfies both needs: chained calls like
 * `.eq().order()` still just see a plain object with methods, but
 * `await query` (i.e. `await ...delete().eq(id)`) genuinely resolves through
 * promise machinery instead of `await`-ing a non-thenable object (which
 * would silently evaluate to the object itself, letting a bug in how
 * deleteSmartCollection reads `error` go undetected via accidental
 * `undefined` duck-typing).
 */
function makeQuery(result: unknown) {
  const query: Record<string, unknown> = {};
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => Promise.resolve(result));
  query.select = vi.fn(() => query);
  query.single = vi.fn(() => Promise.resolve(result));
  query.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return query;
}

describe('fetchSmartCollections', () => {
  it('returns the rows for the given user, most recently updated first', async () => {
    const row = { id: 'c1', user_id: 'u1', name: 'Reading list', color: null, filters: [], created_at: 't', updated_at: 't' };
    const query = makeQuery({ data: [row], error: null });
    const client = { from: vi.fn(() => ({ select: vi.fn(() => query) })) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await fetchSmartCollections(client as any, 'u1');
    expect(result).toEqual([row]);
    expect(client.from).toHaveBeenCalledWith('smart_collections');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(query.order).toHaveBeenCalledWith('updated_at', { ascending: false });
  });

  it('throws if the query errors', async () => {
    const query = makeQuery({ data: null, error: { message: 'boom' } });
    const client = { from: vi.fn(() => ({ select: vi.fn(() => query) })) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(fetchSmartCollections(client as any, 'u1')).rejects.toThrow('boom');
  });
});

describe('createSmartCollection', () => {
  it('inserts with the given user_id and returns the created row', async () => {
    const created = { id: 'c1', user_id: 'u1', name: 'New', color: '#fff', filters: [], created_at: 't', updated_at: 't' };
    const query = makeQuery({ data: created, error: null });
    const insert = vi.fn(() => query);
    const client = { from: vi.fn(() => ({ insert })) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createSmartCollection(client as any, 'u1', { name: 'New', color: '#fff', filters: [] });
    expect(result).toEqual(created);
    expect(insert).toHaveBeenCalledWith([{ name: 'New', color: '#fff', filters: [], user_id: 'u1' }]);
  });

  it('throws if the insert errors', async () => {
    const query = makeQuery({ data: null, error: { message: 'boom' } });
    const client = { from: vi.fn(() => ({ insert: vi.fn(() => query) })) };
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createSmartCollection(client as any, 'u1', { name: 'New', color: null, filters: [] }),
    ).rejects.toThrow('boom');
  });
});

describe('updateSmartCollection', () => {
  it('updates the row by id and returns the updated row', async () => {
    const updated = { id: 'c1', user_id: 'u1', name: 'Renamed', color: null, filters: [], created_at: 't', updated_at: 't2' };
    const query = makeQuery({ data: updated, error: null });
    const client = { from: vi.fn(() => ({ update: vi.fn(() => query) })) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await updateSmartCollection(client as any, 'c1', { name: 'Renamed', color: null, filters: [] });
    expect(result).toEqual(updated);
    expect(query.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('throws if the update errors', async () => {
    const query = makeQuery({ data: null, error: { message: 'boom' } });
    const client = { from: vi.fn(() => ({ update: vi.fn(() => query) })) };
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateSmartCollection(client as any, 'c1', { name: 'Renamed', color: null, filters: [] }),
    ).rejects.toThrow('boom');
  });
});

describe('deleteSmartCollection', () => {
  it('deletes the row by id', async () => {
    const query = makeQuery({ data: null, error: null });
    const client = { from: vi.fn(() => ({ delete: vi.fn(() => query) })) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(deleteSmartCollection(client as any, 'c1')).resolves.toBeUndefined();
    expect(client.from).toHaveBeenCalledWith('smart_collections');
    expect(query.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('throws if the delete errors', async () => {
    const query = makeQuery({ data: null, error: { message: 'boom' } });
    const client = { from: vi.fn(() => ({ delete: vi.fn(() => query) })) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(deleteSmartCollection(client as any, 'c1')).rejects.toThrow('boom');
  });
});
