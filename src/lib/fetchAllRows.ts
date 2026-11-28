/**
 * PostgREST (Supabase's data API) caps an unpaginated `.select()` at a
 * server-configured row limit — 1000 by default on hosted projects, and
 * this repo has no override (no `db-max-rows` config). Past that many rows,
 * a plain `.select('*')` silently returns a truncated page with no error —
 * indistinguishable from "that's really all of them." This pages through
 * with `.range()` until a page comes back shorter than the page size.
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const page = data || [];
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

// Ids go into the request URL (an `in.(...)` list, sometimes twice), and long URLs get rejected
// by proxies, so a big id list is sent in chunks. 50 UUIDs keep even a doubled list near 4 KB.
const ID_CHUNK_SIZE = 50;

/**
 * Runs a paged query once per chunk of ids and returns every row: past PostgREST's row cap, and
 * without an over-long URL however many ids there are. Stops at the first error and returns it,
 * never a partial result.
 */
export async function fetchAllRowsForIds<T>(
  ids: string[],
  buildQuery: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunkSize = ID_CHUNK_SIZE,
): Promise<{ data: T[]; error: unknown }> {
  const unique = [...new Set(ids.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) chunks.push(unique.slice(i, i + chunkSize));
  const results = await Promise.all(chunks.map((chunk) => fetchAllRows<T>((from, to) => buildQuery(chunk, from, to))));
  const failed = results.find((result) => result.error);
  if (failed) return { data: [], error: failed.error };
  return { data: results.flatMap((result) => result.data), error: null };
}
