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
  // eslint-disable-next-line no-constant-condition
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
