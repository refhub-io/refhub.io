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

export type DupeSignal = 'title' | 'authors' | 'year' | 'venue';

export interface SignalConfig {
  enabled: boolean;
  weight: number;
}

export interface DupeHeuristicConfig {
  signals: Record<DupeSignal, SignalConfig>;
  /** an exact DOI match forces the pair score to 1 */
  doiShortCircuit: boolean;
  /** pairs scoring at or above this are reported (0..1) */
  threshold: number;
}

export type DupePresetName = 'strict' | 'balanced' | 'loose';

export const DUPE_PRESETS: Record<DupePresetName, DupeHeuristicConfig> = {
  strict: {
    signals: {
      title: { enabled: true, weight: 0.7 },
      authors: { enabled: true, weight: 0.2 },
      year: { enabled: true, weight: 0.1 },
      venue: { enabled: false, weight: 0.1 },
    },
    doiShortCircuit: true,
    threshold: 0.9,
  },
  balanced: {
    signals: {
      title: { enabled: true, weight: 0.5 },
      authors: { enabled: true, weight: 0.25 },
      year: { enabled: true, weight: 0.15 },
      venue: { enabled: true, weight: 0.1 },
    },
    doiShortCircuit: true,
    threshold: 0.75,
  },
  loose: {
    signals: {
      title: { enabled: true, weight: 0.5 },
      authors: { enabled: true, weight: 0.25 },
      year: { enabled: true, weight: 0.15 },
      venue: { enabled: true, weight: 0.1 },
    },
    doiShortCircuit: true,
    threshold: 0.6,
  },
};

/** minimal publication shape the detector needs; Publication rows satisfy it */
export interface DupeCheckable {
  id?: string;
  title?: string | null;
  authors?: string[] | null;
  year?: number | null;
  journal?: string | null;
  booktitle?: string | null;
  doi?: string | null;
}

export interface SignalScore {
  signal: DupeSignal | 'doi';
  score: number;
  weight: number;
}

export interface PairScore {
  score: number;
  doiMatch: boolean;
  breakdown: SignalScore[];
}

const venueOf = (p: DupeCheckable) => p.journal || p.booktitle || '';

/**
 * Weighted score over the enabled signals. Signals missing on either side are
 * excluded from the weight normalization so sparse metadata isn't punished.
 */
export function scorePair(a: DupeCheckable, b: DupeCheckable, config: DupeHeuristicConfig): PairScore {
  const doiA = normalizeDoi(a.doi);
  const doiB = normalizeDoi(b.doi);
  const doiMatch = Boolean(doiA && doiB && doiA === doiB);

  const raw: Array<{ signal: DupeSignal; available: boolean; score: number }> = [
    {
      signal: 'title',
      available: Boolean(a.title && b.title),
      score: tokenSortRatio(normalizeBiblioString(a.title), normalizeBiblioString(b.title)),
    },
    {
      signal: 'authors',
      available: Boolean(a.authors?.length && b.authors?.length),
      score: lastNameJaccard(a.authors, b.authors),
    },
    {
      signal: 'year',
      available: a.year != null && b.year != null,
      score: a.year === b.year ? 1 : Math.abs((a.year ?? 0) - (b.year ?? 0)) === 1 ? 0.5 : 0,
    },
    {
      signal: 'venue',
      available: Boolean(venueOf(a) && venueOf(b)),
      score: similarityRatio(normalizeBiblioString(venueOf(a)), normalizeBiblioString(venueOf(b))),
    },
  ];

  const breakdown: SignalScore[] = [];
  let totalWeight = 0;
  let weighted = 0;
  for (const r of raw) {
    const cfg = config.signals[r.signal];
    if (!cfg.enabled || !r.available) continue;
    totalWeight += cfg.weight;
    weighted += cfg.weight * r.score;
    breakdown.push({ signal: r.signal, score: r.score, weight: cfg.weight });
  }

  let score = totalWeight > 0 ? weighted / totalWeight : 0;
  if (doiMatch && config.doiShortCircuit) {
    score = 1;
    breakdown.unshift({ signal: 'doi', score: 1, weight: 0 });
  }
  return { score, doiMatch, breakdown };
}

export interface DupeCandidate<T extends DupeCheckable = DupeCheckable> {
  left: T;
  right: T;
  result: PairScore;
}

/**
 * Blocked O(n·b) candidate generation: papers are only compared when they
 * share a block key (year or year+1, first-author last name, first title
 * token, or normalized DOI), then scored and filtered by the threshold.
 */
export function findDuplicateCandidates<T extends DupeCheckable>(
  pubs: T[],
  config: DupeHeuristicConfig,
): DupeCandidate<T>[] {
  const blocks = new Map<string, number[]>();
  const add = (key: string, index: number) => {
    const bucket = blocks.get(key);
    if (bucket) bucket.push(index);
    else blocks.set(key, [index]);
  };

  pubs.forEach((p, i) => {
    if (p.year != null) {
      add(`y:${p.year}`, i);
      add(`y:${p.year + 1}`, i);
    }
    const firstAuthor = p.authors?.[0] ? normalizeLastName(p.authors[0]) : '';
    if (firstAuthor) add(`a:${firstAuthor}`, i);
    const firstToken = normalizeBiblioString(p.title).split(' ')[0];
    if (firstToken) add(`t:${firstToken}`, i);
    const doi = normalizeDoi(p.doi);
    if (doi) add(`d:${doi}`, i);
  });

  const seen = new Set<string>();
  const out: DupeCandidate<T>[] = [];
  for (const indices of blocks.values()) {
    if (indices.length < 2) continue;
    for (let x = 0; x < indices.length; x++) {
      for (let y = x + 1; y < indices.length; y++) {
        const i = Math.min(indices[x], indices[y]);
        const j = Math.max(indices[x], indices[y]);
        if (i === j) continue;
        const key = `${i}:${j}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const result = scorePair(pubs[i], pubs[j], config);
        if (result.score >= config.threshold) out.push({ left: pubs[i], right: pubs[j], result });
      }
    }
  }
  return out.sort((a, b) => b.result.score - a.result.score);
}
