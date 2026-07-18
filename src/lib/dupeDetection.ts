/**
 * Client-side duplicate detection for publications: string normalization,
 * similarity primitives, configurable pair scoring, and blocked candidate
 * generation. Pure functions, no I/O.
 */

/** lowercase, strip LaTeX commands/escapes + braces, strip accents, drop punctuation, collapse whitespace */
export function normalizeBiblioString(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/\\[a-zA-Z]+/g, '') // latex commands: \textit, \c — removed without splitting words
    .replace(/\\[^a-zA-Z\s]/g, '') // accent escapes: \" \' \^ \~ \` \=
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // combining marks left by NFKD
    .replace(/[{}]/g, '') // braces removed (not spaced) so {\"u} variants stay one word
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // remaining punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDoi(doi: string | null | undefined): string {
  if (!doi) return '';
  return doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
}

/** last name of one author string, handling both "Last, First" and "First Last" */
export function normalizeLastName(author: string): string {
  const norm = normalizeBiblioString(author);
  if (!norm) return '';
  const tokens = norm.split(' ');
  if (author.includes(',')) return tokens[0] ?? '';
  return tokens[tokens.length - 1] ?? '';
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** normalized Levenshtein similarity in 0..1 (0 when both empty) */
export function similarityRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 0;
  return 1 - levenshtein(a, b) / max;
}

/** similarityRatio over alphabetically sorted tokens — order-insensitive */
export function tokenSortRatio(a: string, b: string): number {
  const sortTokens = (s: string) => s.split(' ').filter(Boolean).sort().join(' ');
  return similarityRatio(sortTokens(a), sortTokens(b));
}

/** Jaccard overlap of normalized author last names */
export function lastNameJaccard(a?: string[] | null, b?: string[] | null): number {
  const setA = new Set((a ?? []).map(normalizeLastName).filter(Boolean));
  const setB = new Set((b ?? []).map(normalizeLastName).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const name of setA) if (setB.has(name)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}
