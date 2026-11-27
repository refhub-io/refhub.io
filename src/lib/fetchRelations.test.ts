import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { PublicationRelation } from '@/types/database';
import { fetchAllRowsForIds } from './fetchAllRows';
import { fetchRelationsForPublicationIds } from './fetchRelations';

const relation = (id: string, source: string, target: string) =>
  ({ id, publication_id: source, related_publication_id: target, relation_type: 'cites', created_at: '', created_by: 'u' }) as PublicationRelation;

/** A fake client that applies the `.or(... in ...)` filter and `.range()` the way PostgREST would. */
function makeClient(rows: PublicationRelation[], options: { failOnCall?: number } = {}) {
  const filters: string[] = [];
  let calls = 0;
  const client = {
    from: () => ({
      select: () => ({
        or: (filter: string) => ({
          order: () => ({
            range: (from: number, to: number) => {
              calls += 1;
              filters.push(filter);
              if (calls === options.failOnCall) return Promise.resolve({ data: null, error: { message: 'timeout' } });
              const ids = new Set(filter.match(/in\.\(([^)]*)\)/)![1].split(','));
              const matching = rows.filter((r) => ids.has(r.publication_id) || ids.has(r.related_publication_id));
              return Promise.resolve({ data: matching.slice(from, to + 1), error: null });
            },
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, filters };
}

describe('fetchRelationsForPublicationIds', () => {
  it('returns every matching relation past the 1,000-row cap', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => relation(`r${i}`, 'p1', `x${i}`));
    const { client } = makeClient(rows);
    const { data, error } = await fetchRelationsForPublicationIds(client, ['p1']);
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
  });

  it('sends big id lists in chunks of at most 50 ids', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `p${i}`);
    const { client, filters } = makeClient([]);
    await fetchRelationsForPublicationIds(client, ids);
    const chunkSizes = filters.map((f) => f.match(/in\.\(([^)]*)\)/)![1].split(',').length);
    expect(chunkSizes).toEqual([50, 50, 20]);
  });

  it('returns a relation between ids in two different chunks once', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `p${i}`);
    const { client } = makeClient([relation('r1', 'p0', 'p59')]);
    const { data } = await fetchRelationsForPublicationIds(client, ids);
    expect(data.map((r) => r.id)).toEqual(['r1']);
  });

  it('returns the error, never a partial list', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `p${i}`);
    const { client } = makeClient([relation('r1', 'p0', 'p1')], { failOnCall: 2 });
    const { data, error } = await fetchRelationsForPublicationIds(client, ids);
    expect(error).toEqual({ message: 'timeout' });
    expect(data).toEqual([]);
  });
});

describe('fetchAllRowsForIds', () => {
  it('makes no request for an empty id list', async () => {
    let called = false;
    const { data, error } = await fetchAllRowsForIds([], () => {
      called = true;
      return Promise.resolve({ data: [], error: null });
    });
    expect(called).toBe(false);
    expect(data).toEqual([]);
    expect(error).toBeNull();
  });
});
