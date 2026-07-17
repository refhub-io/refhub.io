# find_duplicates Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `find_duplicates` button in the all_papers toolbar opens a three-step wizard: configure a scoring heuristic, review scored candidate pairs, and resolve each pair git-style (field-by-field picks + per-vault annotation choices). Fixes #143 and #145.

**Architecture:** Pure client-side detection lib (`dupeDetection.ts`: normalization, similarity, blocking, scoring — no I/O), a merge module (`dupeMerge.ts`: pure plan builder + Supabase executor), and one dialog component wired into the Dashboard. The naive import-time duplicate checks switch to the shared scorer.

**Tech Stack:** TypeScript, React, shadcn UI primitives already in `src/components/ui/` (dialog, slider, switch, radio-group, badge, scroll-area, label, button), Supabase JS client at `@/integrations/supabase/client`, Vitest.

## Global Constraints

- Never commit to `main`; work on branch `feature/find-duplicates` (created from `chore/dupe-latex-spec` — or from `main` if that spec branch has already merged).
- Spec: `docs/superpowers/specs/2026-07-17-dupe-check-and-latex-notes-design.md` (Part 1).
- Copy style per `.github/refhub-identity.md`: lowercase copy, snake_case labels in monospace contexts, `font-mono` classes, dialogs use `border-2 bg-card/95 backdrop-blur-xl`.
- Verification gates per AGENTS.md before every commit: `npx vitest run`, `npx tsc --noEmit`, `npx eslint <changed files>`.
- Ships as **minor** bump (`1.5.0 → 1.6.0` if the LaTeX PR landed first; otherwise adjust) + `CHANGELOG.md` + `src/config/changelog.ts` entry (next unused `id`).
- Data model reminder: originals live in `publications`; per-vault copies are rows in `vault_publications` with `original_publication_id` → original and their own `notes`; `publication_tags` rows point at either `publication_id` (original) or `vault_publication_id` (copy); `publication_relations` link originals.

---

### Task 1: dupeDetection — normalization + similarity primitives

**Files:**
- Create: `src/lib/dupeDetection.ts`
- Test: `src/lib/dupeDetection.test.ts`

**Interfaces:**
- Produces (used by Tasks 2, 5, 6):
  - `normalizeBiblioString(value: string | null | undefined): string`
  - `normalizeDoi(doi: string | null | undefined): string`
  - `normalizeLastName(author: string): string`
  - `similarityRatio(a: string, b: string): number` (0..1)
  - `tokenSortRatio(a: string, b: string): number` (0..1)
  - `lastNameJaccard(a?: string[] | null, b?: string[] | null): number` (0..1)

- [ ] **Step 1: Branch**

```bash
git checkout chore/dupe-latex-spec && git checkout -b feature/find-duplicates
```

(If `chore/dupe-latex-spec` already merged, branch from up-to-date `main` instead.)

- [ ] **Step 2: Write the failing tests**

Create `src/lib/dupeDetection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  lastNameJaccard,
  normalizeBiblioString,
  normalizeDoi,
  normalizeLastName,
  similarityRatio,
  tokenSortRatio,
} from './dupeDetection';

describe('normalizeBiblioString', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeBiblioString('  The  Grammar of Graphics!  ')).toBe('the grammar of graphics');
  });

  it('strips accents', () => {
    expect(normalizeBiblioString('Précis of naïve Bayes')).toBe('precis of naive bayes');
  });

  it('strips LaTeX accent escapes and braces', () => {
    expect(normalizeBiblioString("M{\\\"u}ller and Garc{\\'i}a")).toBe('muller and garcia');
  });

  it('strips LaTeX commands', () => {
    expect(normalizeBiblioString('\\textit{Visual} Analytics')).toBe('visual analytics');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeBiblioString(null)).toBe('');
    expect(normalizeBiblioString(undefined)).toBe('');
  });
});

describe('normalizeDoi', () => {
  it('lowercases and strips resolver prefixes', () => {
    expect(normalizeDoi('https://doi.org/10.1109/TVCG.2024.1234')).toBe('10.1109/tvcg.2024.1234');
    expect(normalizeDoi('10.1109/TVCG.2024.1234 ')).toBe('10.1109/tvcg.2024.1234');
  });
});

describe('similarityRatio', () => {
  it('is 1 for identical strings and 0 for disjoint ones', () => {
    expect(similarityRatio('grammar of graphics', 'grammar of graphics')).toBe(1);
    expect(similarityRatio('abc', 'xyz')).toBe(0);
  });

  it('scores near-identical strings high', () => {
    expect(similarityRatio('the grammar of graphics', 'the grammar of graphic')).toBeGreaterThan(0.9);
  });
});

describe('tokenSortRatio', () => {
  it('ignores token order', () => {
    expect(tokenSortRatio('graphics grammar of the', 'the grammar of graphics')).toBe(1);
  });
});

describe('normalizeLastName', () => {
  it('handles "Last, First" bibtex order', () => {
    expect(normalizeLastName('Doe, Jane')).toBe('doe');
  });

  it('handles "First Last" order', () => {
    expect(normalizeLastName('Jane van Doe')).toBe('doe');
  });
});

describe('lastNameJaccard', () => {
  it('is 1 for same author sets regardless of name order/format', () => {
    expect(lastNameJaccard(['Doe, Jane', 'Smith, Bob'], ['Jane Doe', 'Bob Smith'])).toBe(1);
  });

  it('is 0.5 when half the union overlaps', () => {
    expect(lastNameJaccard(['Doe, Jane', 'Smith, Bob', 'Ng, Ada'], ['Jane Doe', 'Bob Smith', 'Eve Lee'])).toBe(0.5);
  });

  it('is 0 when either list is empty', () => {
    expect(lastNameJaccard([], ['Jane Doe'])).toBe(0);
    expect(lastNameJaccard(null, undefined)).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/dupeDetection.test.ts`
Expected: FAIL — module `./dupeDetection` not found.

- [ ] **Step 4: Implement the primitives**

Create `src/lib/dupeDetection.ts`:

```ts
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
    .replace(/[\u0300-\u036f]/g, '') // combining marks left by NFKD
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/dupeDetection.test.ts`
Expected: all PASS. (The test string `"M{\\\"u}ller and Garc{\\'i}a"` is JS-escaped source for `M{\"u}ller and Garc{\'i}a`.)

- [ ] **Step 6: Gates and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/lib/dupeDetection.ts src/lib/dupeDetection.test.ts
git add src/lib/dupeDetection.ts src/lib/dupeDetection.test.ts
git commit -m "Add duplicate-detection normalization and similarity primitives"
```

---

### Task 2: dupeDetection — pair scoring, presets, blocked candidate generation

**Files:**
- Modify: `src/lib/dupeDetection.ts`
- Test: `src/lib/dupeDetection.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 primitives.
- Produces (used by Tasks 4, 5, 6):

```ts
export type DupeSignal = 'title' | 'authors' | 'year' | 'venue';
export interface SignalConfig { enabled: boolean; weight: number }
export interface DupeHeuristicConfig {
  signals: Record<DupeSignal, SignalConfig>;
  doiShortCircuit: boolean;
  threshold: number; // 0..1
}
export type DupePresetName = 'strict' | 'balanced' | 'loose';
export const DUPE_PRESETS: Record<DupePresetName, DupeHeuristicConfig>;
export interface DupeCheckable {
  id?: string;
  title?: string | null;
  authors?: string[] | null;
  year?: number | null;
  journal?: string | null;
  booktitle?: string | null;
  doi?: string | null;
}
export interface SignalScore { signal: DupeSignal | 'doi'; score: number; weight: number }
export interface PairScore { score: number; doiMatch: boolean; breakdown: SignalScore[] }
export function scorePair(a: DupeCheckable, b: DupeCheckable, config: DupeHeuristicConfig): PairScore;
export interface DupeCandidate<T extends DupeCheckable = DupeCheckable> { left: T; right: T; result: PairScore }
export function findDuplicateCandidates<T extends DupeCheckable>(pubs: T[], config: DupeHeuristicConfig): DupeCandidate<T>[];
```

- [ ] **Step 1: Append the failing tests**

Append to `src/lib/dupeDetection.test.ts`:

```ts
import { DUPE_PRESETS, findDuplicateCandidates, scorePair } from './dupeDetection';

const paper = (over: Partial<import('./dupeDetection').DupeCheckable> = {}) => ({
  id: over.id ?? 'p1',
  title: 'The Grammar of Graphics',
  authors: ['Wilkinson, Leland'],
  year: 2005,
  journal: 'Statistics and Computing',
  doi: null,
  ...over,
});

describe('scorePair', () => {
  it('scores identical papers 1.0', () => {
    expect(scorePair(paper(), paper({ id: 'p2' }), DUPE_PRESETS.balanced).score).toBe(1);
  });

  it('short-circuits to 1.0 on DOI match even with different titles', () => {
    const a = paper({ doi: '10.1/x' });
    const b = paper({ id: 'p2', doi: 'https://doi.org/10.1/X', title: 'Completely Different' });
    const result = scorePair(a, b, DUPE_PRESETS.balanced);
    expect(result.score).toBe(1);
    expect(result.doiMatch).toBe(true);
  });

  it('excludes signals missing on either side from the weighting', () => {
    // year missing on one side: title+authors identical → still 1.0
    const result = scorePair(paper(), paper({ id: 'p2', year: null, journal: null }), DUPE_PRESETS.balanced);
    expect(result.score).toBe(1);
    expect(result.breakdown.map((s) => s.signal)).toEqual(['title', 'authors']);
  });

  it('gives year ±1 half credit', () => {
    const result = scorePair(paper(), paper({ id: 'p2', year: 2006 }), DUPE_PRESETS.balanced);
    const year = result.breakdown.find((s) => s.signal === 'year');
    expect(year?.score).toBe(0.5);
  });

  it('scores unrelated papers low', () => {
    const other = paper({
      id: 'p2',
      title: 'Attention Is All You Need',
      authors: ['Vaswani, Ashish'],
      year: 2017,
      journal: 'NeurIPS',
    });
    expect(scorePair(paper(), other, DUPE_PRESETS.balanced).score).toBeLessThan(0.3);
  });

  it('ignores disabled signals', () => {
    const config = {
      ...DUPE_PRESETS.balanced,
      signals: {
        ...DUPE_PRESETS.balanced.signals,
        title: { enabled: false, weight: 0.5 },
      },
    };
    const result = scorePair(paper({ title: 'A' }), paper({ id: 'p2', title: 'B' }), config);
    expect(result.breakdown.find((s) => s.signal === 'title')).toBeUndefined();
  });
});

describe('findDuplicateCandidates', () => {
  it('finds near-duplicate pairs across LaTeX/accent variants, sorted by score', () => {
    const pubs = [
      paper({ id: 'a', title: 'Visualization of M{\\"u}ller Data' , authors: ['M{\\"u}ller, Anna'] }),
      paper({ id: 'b', title: 'Visualization of Müller Data', authors: ['Anna Müller'] }),
      paper({ id: 'c', title: 'Attention Is All You Need', authors: ['Vaswani, Ashish'], year: 2017 }),
    ];
    const candidates = findDuplicateCandidates(pubs, DUPE_PRESETS.balanced);
    expect(candidates).toHaveLength(1);
    expect([candidates[0].left.id, candidates[0].right.id].sort()).toEqual(['a', 'b']);
  });

  it('pairs papers one year apart (blocking does not miss ±1)', () => {
    const pubs = [paper({ id: 'a', year: 2005 }), paper({ id: 'b', year: 2006 })];
    expect(findDuplicateCandidates(pubs, DUPE_PRESETS.balanced)).toHaveLength(1);
  });

  it('always pairs DOI-equal papers even when nothing else matches', () => {
    const pubs = [
      paper({ id: 'a', doi: '10.9/z', title: 'X', authors: ['A B'], year: 1990, journal: null }),
      paper({ id: 'b', doi: '10.9/z', title: 'Utterly Different', authors: ['C D'], year: 2020, journal: null }),
    ];
    expect(findDuplicateCandidates(pubs, DUPE_PRESETS.balanced)).toHaveLength(1);
  });

  it('returns empty for an empty library', () => {
    expect(findDuplicateCandidates([], DUPE_PRESETS.balanced)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/dupeDetection.test.ts`
Expected: FAIL — `DUPE_PRESETS`, `scorePair`, `findDuplicateCandidates` not exported.

- [ ] **Step 3: Implement scoring, presets, candidate generation**

Append to `src/lib/dupeDetection.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/dupeDetection.test.ts`
Expected: all PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/lib/dupeDetection.ts src/lib/dupeDetection.test.ts
git add src/lib/dupeDetection.ts src/lib/dupeDetection.test.ts
git commit -m "Add configurable pair scoring and blocked duplicate-candidate generation"
```

---

### Task 3: dupeMerge — conflict listing, plan builder, Supabase executor

**Files:**
- Create: `src/lib/dupeMerge.ts`
- Test: `src/lib/dupeMerge.test.ts`

**Interfaces:**
- Consumes: `BIBLIOGRAPHIC_FIELDS`, `BibliographicField` from `@/lib/publicationSync`; `supabase` from `@/integrations/supabase/client`; `Publication` from `@/types/database`.
- Produces (used by Tasks 4, 5):

```ts
export type Side = 'left' | 'right';
export interface VaultCopyRef { id: string; vault_id: string; original_publication_id: string | null }
export interface FieldConflict { field: BibliographicField; left: unknown; right: unknown }
export function listFieldConflicts(left: Publication, right: Publication): FieldConflict[];
export interface VaultConflict { vault_id: string; leftCopy: VaultCopyRef; rightCopy: VaultCopyRef }
export function listVaultConflicts(leftId: string, rightId: string, links: VaultCopyRef[]): VaultConflict[];
export interface MergeDecisions {
  survivor: Side;
  fieldChoices: Partial<Record<BibliographicField, Side>>;
  vaultChoices: Record<string, Side>; // keyed by vault_id, for conflicted vaults
}
export interface MergePlan {
  survivorId: string;
  loserId: string;
  survivorPatch: Partial<Publication>;
  repointCopyIds: string[]; // vault_publications rows whose original_publication_id moves to survivor
  deleteCopyIds: string[];  // losing copies (and their tags) removed from conflicted vaults
}
export function buildMergePlan(left: Publication, right: Publication, links: VaultCopyRef[], decisions: MergeDecisions): MergePlan;
export async function executeMergePlan(plan: MergePlan): Promise<void>;
```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/dupeMerge.test.ts` (pure functions only — the executor is exercised manually in Task 5):

```ts
import { describe, expect, it } from 'vitest';

import type { Publication } from '@/types/database';
import { buildMergePlan, listFieldConflicts, listVaultConflicts } from './dupeMerge';

const basePub = (over: Partial<Publication>): Publication =>
  ({
    id: 'x',
    user_id: 'u1',
    title: 'A Title',
    authors: ['Doe, Jane'],
    year: 2020,
    journal: 'A Journal',
    volume: null,
    issue: null,
    pages: null,
    doi: null,
    url: null,
    abstract: null,
    pdf_url: null,
    bibtex_key: null,
    publication_type: 'article',
    notes: null,
    booktitle: null,
    chapter: null,
    edition: null,
    editor: null,
    howpublished: null,
    institution: null,
    number: null,
    organization: null,
    publisher: null,
    school: null,
    series: null,
    type: null,
    eid: null,
    isbn: null,
    issn: null,
    keywords: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...over,
  }) as Publication;

describe('listFieldConflicts', () => {
  it('reports only fields where both sides are non-empty and different', () => {
    const left = basePub({ id: 'l', pages: '1-10', doi: '10.1/x', volume: null });
    const right = basePub({ id: 'r', pages: '1-12', doi: '10.1/x', volume: '3' });
    const conflicts = listFieldConflicts(left, right);
    expect(conflicts.map((c) => c.field)).toEqual(['pages']);
  });
});

describe('listVaultConflicts', () => {
  const links = [
    { id: 'c1', vault_id: 'v1', original_publication_id: 'l' },
    { id: 'c2', vault_id: 'v1', original_publication_id: 'r' },
    { id: 'c3', vault_id: 'v2', original_publication_id: 'r' },
    { id: 'c4', vault_id: 'v3', original_publication_id: 'other' },
  ];

  it('reports vaults containing copies of both papers', () => {
    const conflicts = listVaultConflicts('l', 'r', links);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].vault_id).toBe('v1');
    expect(conflicts[0].leftCopy.id).toBe('c1');
    expect(conflicts[0].rightCopy.id).toBe('c2');
  });
});

describe('buildMergePlan', () => {
  const left = basePub({ id: 'l', pages: '1-10', volume: null, abstract: 'left abstract' });
  const right = basePub({ id: 'r', pages: '1-12', volume: '3', abstract: null });
  const links = [
    { id: 'c1', vault_id: 'v1', original_publication_id: 'l' },
    { id: 'c2', vault_id: 'v1', original_publication_id: 'r' },
    { id: 'c3', vault_id: 'v2', original_publication_id: 'r' },
  ];

  it('applies field choices, auto-fills one-sided values, plans repoint/delete', () => {
    const plan = buildMergePlan(left, right, links, {
      survivor: 'left',
      fieldChoices: { pages: 'right' },
      vaultChoices: { v1: 'right' },
    });

    expect(plan.survivorId).toBe('l');
    expect(plan.loserId).toBe('r');
    // chosen from right
    expect(plan.survivorPatch.pages).toBe('1-12');
    // auto-filled from the non-empty side, no explicit choice needed
    expect(plan.survivorPatch.volume).toBe('3');
    // survivor already has this value → not in patch
    expect(plan.survivorPatch.abstract).toBeUndefined();
    // v1 keeps the right copy (which belongs to the loser → re-point), left copy deleted
    expect(plan.deleteCopyIds).toEqual(['c1']);
    // c2 kept in v1 (re-pointed) + c3 un-conflicted loser copy (re-pointed)
    expect([...plan.repointCopyIds].sort()).toEqual(['c2', 'c3']);
  });

  it('defaults unspecified conflicted vaults to the survivor side', () => {
    const plan = buildMergePlan(left, right, links, {
      survivor: 'left',
      fieldChoices: {},
      vaultChoices: {},
    });
    // v1 defaults to left copy kept (already points at survivor, no repoint), right copy deleted
    expect(plan.deleteCopyIds).toEqual(['c2']);
    expect(plan.repointCopyIds).toEqual(['c3']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/dupeMerge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement dupeMerge**

Create `src/lib/dupeMerge.ts`:

```ts
/**
 * Git-like merge of two duplicate publications: pure conflict listing +
 * plan building, and a Supabase executor that applies the plan.
 * See docs/superpowers/specs/2026-07-17-dupe-check-and-latex-notes-design.md.
 */
import { supabase } from '@/integrations/supabase/client';
import { BIBLIOGRAPHIC_FIELDS, type BibliographicField } from '@/lib/publicationSync';
import type { Publication } from '@/types/database';

export type Side = 'left' | 'right';

export interface VaultCopyRef {
  id: string;
  vault_id: string;
  original_publication_id: string | null;
}

const comparable = (v: unknown): string => (Array.isArray(v) ? v.join('|') : v == null ? '' : String(v));
const isEmpty = (v: unknown): boolean =>
  v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

export interface FieldConflict {
  field: BibliographicField;
  left: unknown;
  right: unknown;
}

/** fields where both sides have a value and they differ; one-sided values auto-fill and never conflict */
export function listFieldConflicts(left: Publication, right: Publication): FieldConflict[] {
  const out: FieldConflict[] = [];
  for (const field of BIBLIOGRAPHIC_FIELDS) {
    const l = left[field];
    const r = right[field];
    if (isEmpty(l) || isEmpty(r)) continue;
    if (comparable(l) !== comparable(r)) out.push({ field, left: l, right: r });
  }
  return out;
}

export interface VaultConflict {
  vault_id: string;
  leftCopy: VaultCopyRef;
  rightCopy: VaultCopyRef;
}

/** vaults that contain a copy of BOTH papers — the user must pick whose annotations survive */
export function listVaultConflicts(leftId: string, rightId: string, links: VaultCopyRef[]): VaultConflict[] {
  const byVault = new Map<string, { left?: VaultCopyRef; right?: VaultCopyRef }>();
  for (const link of links) {
    if (link.original_publication_id !== leftId && link.original_publication_id !== rightId) continue;
    const entry = byVault.get(link.vault_id) ?? {};
    if (link.original_publication_id === leftId) entry.left = link;
    else entry.right = link;
    byVault.set(link.vault_id, entry);
  }
  const out: VaultConflict[] = [];
  for (const [vault_id, entry] of byVault) {
    if (entry.left && entry.right) out.push({ vault_id, leftCopy: entry.left, rightCopy: entry.right });
  }
  return out;
}

export interface MergeDecisions {
  survivor: Side;
  fieldChoices: Partial<Record<BibliographicField, Side>>;
  /** keyed by vault_id for conflicted vaults; missing entries default to the survivor side */
  vaultChoices: Record<string, Side>;
}

export interface MergePlan {
  survivorId: string;
  loserId: string;
  survivorPatch: Partial<Publication>;
  repointCopyIds: string[];
  deleteCopyIds: string[];
}

export function buildMergePlan(
  left: Publication,
  right: Publication,
  links: VaultCopyRef[],
  decisions: MergeDecisions,
): MergePlan {
  const survivor = decisions.survivor === 'left' ? left : right;
  const loser = decisions.survivor === 'left' ? right : left;

  const survivorPatch: Partial<Publication> = {};
  for (const field of BIBLIOGRAPHIC_FIELDS) {
    const l = left[field];
    const r = right[field];
    let value: unknown;
    if (isEmpty(l)) value = r;
    else if (isEmpty(r)) value = l;
    else if (comparable(l) === comparable(r)) value = l;
    else value = (decisions.fieldChoices[field] ?? decisions.survivor) === 'left' ? l : r;
    if (comparable(value) !== comparable(survivor[field])) {
      (survivorPatch as Record<string, unknown>)[field] = value;
    }
  }

  const conflicts = listVaultConflicts(left.id, right.id, links);
  const conflictedVaultIds = new Set(conflicts.map((c) => c.vault_id));

  const repointCopyIds: string[] = [];
  const deleteCopyIds: string[] = [];
  for (const conflict of conflicts) {
    const keep = decisions.vaultChoices[conflict.vault_id] ?? decisions.survivor;
    const keptCopy = keep === 'left' ? conflict.leftCopy : conflict.rightCopy;
    const droppedCopy = keep === 'left' ? conflict.rightCopy : conflict.leftCopy;
    deleteCopyIds.push(droppedCopy.id);
    if (keptCopy.original_publication_id === loser.id) repointCopyIds.push(keptCopy.id);
  }
  for (const link of links) {
    if (link.original_publication_id !== loser.id) continue;
    if (conflictedVaultIds.has(link.vault_id)) continue;
    repointCopyIds.push(link.id);
  }

  return { survivorId: survivor.id, loserId: loser.id, survivorPatch, repointCopyIds, deleteCopyIds };
}

/**
 * Applies a merge plan. Steps run in dependency order; the first failure
 * throws with a step description and aborts the remaining steps.
 */
export async function executeMergePlan(plan: MergePlan): Promise<void> {
  if (Object.keys(plan.survivorPatch).length > 0) {
    const { error } = await supabase.from('publications').update(plan.survivorPatch).eq('id', plan.survivorId);
    if (error) throw new Error(`updating merged fields: ${error.message}`);
  }

  if (plan.deleteCopyIds.length > 0) {
    const { error: tagError } = await supabase
      .from('publication_tags')
      .delete()
      .in('vault_publication_id', plan.deleteCopyIds);
    if (tagError) throw new Error(`removing tags of dropped copies: ${tagError.message}`);
    const { error } = await supabase.from('vault_publications').delete().in('id', plan.deleteCopyIds);
    if (error) throw new Error(`removing dropped vault copies: ${error.message}`);
  }

  if (plan.repointCopyIds.length > 0) {
    const { error } = await supabase
      .from('vault_publications')
      .update({ original_publication_id: plan.survivorId })
      .in('id', plan.repointCopyIds);
    if (error) throw new Error(`re-pointing vault copies: ${error.message}`);
  }

  // move the loser's tags unless the survivor already carries the same tag
  const { data: loserTags, error: loserTagError } = await supabase
    .from('publication_tags')
    .select('id, tag_id')
    .eq('publication_id', plan.loserId);
  if (loserTagError) throw new Error(`reading tags: ${loserTagError.message}`);
  if (loserTags && loserTags.length > 0) {
    const { data: survivorTags, error: survivorTagError } = await supabase
      .from('publication_tags')
      .select('tag_id')
      .eq('publication_id', plan.survivorId);
    if (survivorTagError) throw new Error(`reading tags: ${survivorTagError.message}`);
    const existing = new Set((survivorTags ?? []).map((t) => t.tag_id));
    const toMove = loserTags.filter((t) => !existing.has(t.tag_id)).map((t) => t.id);
    const toDrop = loserTags.filter((t) => existing.has(t.tag_id)).map((t) => t.id);
    if (toMove.length > 0) {
      const { error } = await supabase
        .from('publication_tags')
        .update({ publication_id: plan.survivorId })
        .in('id', toMove);
      if (error) throw new Error(`moving tags: ${error.message}`);
    }
    if (toDrop.length > 0) {
      const { error } = await supabase.from('publication_tags').delete().in('id', toDrop);
      if (error) throw new Error(`dropping duplicate tags: ${error.message}`);
    }
  }

  // re-point relations; drop any that would now relate the survivor to itself
  const { data: relations, error: relationError } = await supabase
    .from('publication_relations')
    .select('id, publication_id, related_publication_id')
    .or(`publication_id.eq.${plan.loserId},related_publication_id.eq.${plan.loserId}`);
  if (relationError) throw new Error(`reading relations: ${relationError.message}`);
  for (const relation of relations ?? []) {
    const from = relation.publication_id === plan.loserId ? plan.survivorId : relation.publication_id;
    const to = relation.related_publication_id === plan.loserId ? plan.survivorId : relation.related_publication_id;
    if (from === to) {
      const { error } = await supabase.from('publication_relations').delete().eq('id', relation.id);
      if (error) throw new Error(`dropping self-relation: ${error.message}`);
      continue;
    }
    const { error } = await supabase
      .from('publication_relations')
      .update({ publication_id: from, related_publication_id: to })
      .eq('id', relation.id);
    if (error) throw new Error(`re-pointing relation: ${error.message}`);
  }

  const { error: deleteError, count } = await supabase
    .from('publications')
    .delete({ count: 'exact' })
    .eq('id', plan.loserId);
  if (deleteError) throw new Error(`deleting duplicate: ${deleteError.message}`);
  if (!count) throw new Error('the duplicate row could not be deleted — you may not have permission');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/dupeMerge.test.ts`
Expected: all PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/lib/dupeMerge.ts src/lib/dupeMerge.test.ts
git add src/lib/dupeMerge.ts src/lib/dupeMerge.test.ts
git commit -m "Add merge-plan builder and executor for duplicate resolution"
```

---

### Task 4: DuplicateCheckDialog — wizard UI (configure → review → resolve)

**Files:**
- Create: `src/components/publications/DuplicateCheckDialog.tsx`

**Interfaces:**
- Consumes: Task 2 (`DUPE_PRESETS`, `findDuplicateCandidates`, `DupeHeuristicConfig`, `DupeCandidate`, `DupeSignal`), Task 3 (`listFieldConflicts`, `listVaultConflicts`, `buildMergePlan`, `executeMergePlan`, `MergeDecisions`, `Side`, `VaultCopyRef`).
- Produces (used by Task 5):

```ts
export interface DuplicateCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publications: Publication[];      // originals (all_papers)
  vaults: Vault[];                  // for naming conflicted vaults
  vaultCopies: VaultCopyRef[];      // all vault_publications refs
  onMergeComplete: () => void;      // refetch dashboard data
}
export function DuplicateCheckDialog(props: DuplicateCheckDialogProps): JSX.Element;
```

- [ ] **Step 1: Create the component**

Create `src/components/publications/DuplicateCheckDialog.tsx`. Complete implementation (follow `.github/refhub-identity.md` if any styling detail below contradicts it):

```tsx
import { useMemo, useState } from 'react';
import { ArrowLeft, GitMerge, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  DUPE_PRESETS,
  type DupeCandidate,
  type DupeHeuristicConfig,
  type DupePresetName,
  type DupeSignal,
  findDuplicateCandidates,
} from '@/lib/dupeDetection';
import {
  buildMergePlan,
  executeMergePlan,
  listFieldConflicts,
  listVaultConflicts,
  type Side,
  type VaultCopyRef,
} from '@/lib/dupeMerge';
import { useToast } from '@/hooks/use-toast';
import type { BibliographicField } from '@/lib/publicationSync';
import type { Publication, Vault } from '@/types/database';

export interface DuplicateCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publications: Publication[];
  vaults: Vault[];
  vaultCopies: VaultCopyRef[];
  onMergeComplete: () => void;
}

type WizardStep = 'configure' | 'review' | 'resolve';

const SIGNAL_LABELS: Record<DupeSignal, string> = {
  title: 'title_similarity',
  authors: 'author_overlap',
  year: 'year_match',
  venue: 'venue_similarity',
};

const pairKey = (c: DupeCandidate<Publication>) => [c.left.id, c.right.id].sort().join(':');

const fieldValueLabel = (value: unknown): string => {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
};

export function DuplicateCheckDialog({
  open,
  onOpenChange,
  publications,
  vaults,
  vaultCopies,
  onMergeComplete,
}: DuplicateCheckDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>('configure');
  const [config, setConfig] = useState<DupeHeuristicConfig>(DUPE_PRESETS.balanced);
  const [candidates, setCandidates] = useState<DupeCandidate<Publication>[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<DupeCandidate<Publication> | null>(null);
  const [survivor, setSurvivor] = useState<Side>('left');
  const [fieldChoices, setFieldChoices] = useState<Partial<Record<BibliographicField, Side>>>({});
  const [vaultChoices, setVaultChoices] = useState<Record<string, Side>>({});
  const [merging, setMerging] = useState(false);

  const originals = useMemo(
    () => publications.filter((p) => !p.original_publication_id),
    [publications],
  );

  const vaultNames = useMemo(() => new Map(vaults.map((v) => [v.id, v.name])), [vaults]);

  const visibleCandidates = candidates.filter((c) => !dismissed.has(pairKey(c)));

  const runScan = () => {
    setCandidates(findDuplicateCandidates(originals, config));
    setDismissed(new Set());
    setStep('review');
  };

  const openResolve = (candidate: DupeCandidate<Publication>) => {
    setActive(candidate);
    // default survivor: the older row
    setSurvivor(candidate.left.created_at <= candidate.right.created_at ? 'left' : 'right');
    setFieldChoices({});
    setVaultChoices({});
    setStep('resolve');
  };

  const updateSignal = (signal: DupeSignal, patch: Partial<{ enabled: boolean; weight: number }>) => {
    setConfig((prev) => ({
      ...prev,
      signals: { ...prev.signals, [signal]: { ...prev.signals[signal], ...patch } },
    }));
  };

  const applyPreset = (name: DupePresetName) => setConfig(DUPE_PRESETS[name]);

  const handleMerge = async (overrideChoices?: Partial<Record<BibliographicField, Side>>) => {
    if (!active) return;
    setMerging(true);
    try {
      const plan = buildMergePlan(active.left, active.right, vaultCopies, {
        survivor,
        fieldChoices: overrideChoices ?? fieldChoices,
        vaultChoices,
      });
      await executeMergePlan(plan);
      toast({
        title: 'Papers merged',
        description: `Kept "${(survivor === 'left' ? active.left : active.right).title}"; re-pointed ${plan.repointCopyIds.length} vault ${plan.repointCopyIds.length === 1 ? 'copy' : 'copies'}.`,
      });
      // drop every remaining candidate touching the deleted paper
      const loserId = plan.loserId;
      setCandidates((prev) => prev.filter((c) => c.left.id !== loserId && c.right.id !== loserId));
      setActive(null);
      setStep('review');
      onMergeComplete();
    } catch (error) {
      toast({
        title: 'Merge failed',
        description: (error as Error).message,
        variant: 'destructive',
        feedbackSeverity: 'error',
      });
    } finally {
      setMerging(false);
    }
  };

  const takeAll = (side: Side) => {
    if (!active) return;
    const all: Partial<Record<BibliographicField, Side>> = {};
    for (const conflict of listFieldConflicts(active.left, active.right)) {
      all[conflict.field] = side;
    }
    setFieldChoices(all);
    void handleMerge(all);
  };

  const renderConfigure = () => (
    <div className="space-y-5 font-mono">
      <div className="flex gap-2">
        {(['strict', 'balanced', 'loose'] as DupePresetName[]).map((name) => (
          <Button key={name} variant="outline" size="sm" className="font-mono" onClick={() => applyPreset(name)}>
            {name}
          </Button>
        ))}
      </div>

      {(Object.keys(SIGNAL_LABELS) as DupeSignal[]).map((signal) => (
        <div key={signal} className="flex items-center gap-4">
          <Switch
            checked={config.signals[signal].enabled}
            onCheckedChange={(enabled) => updateSignal(signal, { enabled })}
            aria-label={`toggle ${SIGNAL_LABELS[signal]}`}
          />
          <Label className="w-40 text-sm">{SIGNAL_LABELS[signal]}</Label>
          <Slider
            className="flex-1"
            min={0}
            max={100}
            step={5}
            disabled={!config.signals[signal].enabled}
            value={[Math.round(config.signals[signal].weight * 100)]}
            onValueChange={([v]) => updateSignal(signal, { weight: v / 100 })}
          />
          <span className="w-10 text-right text-xs text-muted-foreground">
            {Math.round(config.signals[signal].weight * 100)}%
          </span>
        </div>
      ))}

      <div className="flex items-center gap-4 border-t pt-4">
        <Label className="w-40 text-sm">score_threshold</Label>
        <Slider
          className="flex-1"
          min={30}
          max={100}
          step={5}
          value={[Math.round(config.threshold * 100)]}
          onValueChange={([v]) => setConfig((prev) => ({ ...prev, threshold: v / 100 }))}
        />
        <span className="w-10 text-right text-xs text-muted-foreground">{Math.round(config.threshold * 100)}%</span>
      </div>

      <p className="text-xs text-muted-foreground">// exact_doi_matches_always_score_100%</p>

      <Button onClick={runScan} variant="glow" className="w-full font-mono">
        <Search className="mr-2 h-4 w-4" />
        scan_library ({originals.length} papers)
      </Button>
    </div>
  );

  const renderReview = () => (
    <div className="space-y-3 font-mono">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="font-mono" onClick={() => setStep('configure')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> adjust_heuristic
        </Button>
        <span className="text-xs text-muted-foreground">
          {visibleCandidates.length} candidate_pair{visibleCandidates.length === 1 ? '' : 's'}
        </span>
      </div>

      {visibleCandidates.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">// no_duplicates_found_above_threshold</p>
      ) : (
        <ScrollArea className="h-[420px] pr-3">
          <div className="space-y-2">
            {visibleCandidates.map((candidate) => (
              <div key={pairKey(candidate)} className="rounded-lg border-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="truncate font-semibold">{candidate.left.title}</p>
                    <p className="truncate font-semibold">{candidate.right.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {candidate.left.year ?? '—'} / {candidate.right.year ?? '—'} ·{' '}
                      {(candidate.left.authors ?? []).slice(0, 2).join(', ') || '—'}
                    </p>
                  </div>
                  <Badge variant={candidate.result.score >= 0.9 ? 'destructive' : 'secondary'} className="font-mono">
                    {Math.round(candidate.result.score * 100)}%
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {candidate.result.breakdown.map((s) => (
                    <span key={s.signal} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {s.signal}:{Math.round(s.score * 100)}%
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="glow" className="font-mono" onClick={() => openResolve(candidate)}>
                    <GitMerge className="mr-1 h-3 w-3" /> resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-mono"
                    onClick={() => setDismissed((prev) => new Set([...prev, pairKey(candidate)]))}
                  >
                    not_a_dupe
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  const renderResolve = () => {
    if (!active) return null;
    const conflicts = listFieldConflicts(active.left, active.right);
    const vaultConflicts = listVaultConflicts(active.left.id, active.right.id, vaultCopies);

    const sideLabel = (side: Side) =>
      side === 'left' ? active.left.title : active.right.title;

    return (
      <div className="space-y-4 font-mono">
        <Button variant="ghost" size="sm" className="font-mono" onClick={() => { setActive(null); setStep('review'); }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> back_to_candidates
        </Button>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">// survivor (keeps its id, inherits everything)</Label>
          <div className="flex gap-2">
            {(['left', 'right'] as Side[]).map((side) => (
              <Button
                key={side}
                size="sm"
                variant={survivor === side ? 'glow' : 'outline'}
                className="min-w-0 flex-1 justify-start font-mono"
                onClick={() => setSurvivor(side)}
              >
                <span className="truncate">{sideLabel(side)}</span>
              </Button>
            ))}
          </div>
        </div>

        <ScrollArea className="h-[300px] pr-3">
          <div className="space-y-3">
            {conflicts.length === 0 ? (
              <p className="text-xs text-muted-foreground">// no_field_conflicts — metadata merges cleanly</p>
            ) : (
              conflicts.map((conflict) => (
                <div key={conflict.field} className="rounded-lg border-2 p-2 text-xs">
                  <p className="mb-1 font-semibold">{conflict.field}</p>
                  {(['left', 'right'] as Side[]).map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => setFieldChoices((prev) => ({ ...prev, [conflict.field]: side }))}
                      className={`block w-full rounded border px-2 py-1 text-left ${
                        (fieldChoices[conflict.field] ?? survivor) === side
                          ? 'border-primary bg-primary/10'
                          : 'border-transparent hover:bg-muted'
                      }`}
                    >
                      {fieldValueLabel(side === 'left' ? conflict.left : conflict.right)}
                    </button>
                  ))}
                </div>
              ))
            )}

            {vaultConflicts.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  // both_papers_live_in_these_vaults — pick whose notes/tags survive per vault
                </p>
                {vaultConflicts.map((conflict) => (
                  <div key={conflict.vault_id} className="rounded-lg border-2 p-2 text-xs">
                    <p className="mb-1 font-semibold">{vaultNames.get(conflict.vault_id) ?? conflict.vault_id}</p>
                    {(['left', 'right'] as Side[]).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => setVaultChoices((prev) => ({ ...prev, [conflict.vault_id]: side }))}
                        className={`block w-full truncate rounded border px-2 py-1 text-left ${
                          (vaultChoices[conflict.vault_id] ?? survivor) === side
                            ? 'border-primary bg-primary/10'
                            : 'border-transparent hover:bg-muted'
                        }`}
                      >
                        keep annotations of: {sideLabel(side)}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button size="sm" variant="outline" className="font-mono" disabled={merging} onClick={() => takeAll('left')}>
            take_all_left
          </Button>
          <Button size="sm" variant="outline" className="font-mono" disabled={merging} onClick={() => takeAll('right')}>
            take_all_right
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto font-mono"
            disabled={merging}
            onClick={() => {
              setDismissed((prev) => (active ? new Set([...prev, pairKey(active)]) : prev));
              setActive(null);
              setStep('review');
            }}
          >
            keep_both
          </Button>
          <Button size="sm" variant="glow" className="font-mono" disabled={merging} onClick={() => handleMerge()}>
            <GitMerge className="mr-1 h-3 w-3" />
            {merging ? 'merging…' : 'merge'}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!merging) onOpenChange(next); }}>
      <DialogContent className="max-w-2xl border-2 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-xl font-bold">find_duplicates</DialogTitle>
          <DialogDescription className="font-mono text-sm">
            {step === 'configure' && '// tune_the_matching_heuristic_then_scan'}
            {step === 'review' && '// review_scored_candidate_pairs'}
            {step === 'resolve' && '// resolve_git_style — pick fields and annotations to keep'}
          </DialogDescription>
        </DialogHeader>
        {step === 'configure' && renderConfigure()}
        {step === 'review' && renderReview()}
        {step === 'resolve' && renderResolve()}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Gates**

```bash
npx tsc --noEmit && npx eslint src/components/publications/DuplicateCheckDialog.tsx && npx vitest run
```

Expected: clean. Fix any drift between this plan's code and the actual `toast` / `Button` variant signatures by reading the neighboring dialogs (`AddImportDialog.tsx`) — they are the source of truth for house style.

- [ ] **Step 3: Commit**

```bash
git add src/components/publications/DuplicateCheckDialog.tsx
git commit -m "Add find_duplicates wizard dialog (configure, review, git-style resolve)"
```

---

### Task 5: Wire into PublicationList toolbar + Dashboard

**Files:**
- Modify: `src/components/publications/PublicationList.tsx` (~line 49 props interface, ~line 97 destructuring, ~line 593 toolbar)
- Modify: `src/pages/Dashboard.tsx` (~line 202 state, ~line 1663 `<PublicationList …>`, ~line 1727 dialog mounts)

**Interfaces:**
- Consumes: Task 4's `DuplicateCheckDialog`; Dashboard's existing `publications`, `vaults`, `sharedVaults`, `vaultPublicationLinks`, `fetchData`, `clearPageCache`.
- Produces: `PublicationList` gains optional prop `onFindDuplicates?: () => void`.

- [ ] **Step 1: Add the toolbar button to PublicationList**

In `src/components/publications/PublicationList.tsx`:

Add to `PublicationListProps` (after `onAddPublication?: () => void;`):

```ts
  onFindDuplicates?: () => void;
```

Add `onFindDuplicates,` to the destructured props (after `onAddPublication,`).

Add `CopyCheck` to the existing `lucide-react` import.

In the toolbar, directly BEFORE the `{onAddPublication && (` block at ~line 593, insert:

```tsx
            {onFindDuplicates && (
              <Button onClick={onFindDuplicates} variant="outline" className="h-9 w-9 sm:w-auto sm:px-3 font-mono">
                <CopyCheck className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">find_duplicates</span>
              </Button>
            )}
```

- [ ] **Step 2: Mount the dialog in Dashboard**

In `src/pages/Dashboard.tsx`:

Add import:

```ts
import { DuplicateCheckDialog } from '@/components/publications/DuplicateCheckDialog';
```

Add state next to `isImportDialogOpen` (~line 202):

```ts
  const [isDupeCheckOpen, setIsDupeCheckOpen] = useState(false);
```

Add prop to the `<PublicationList …>` call (after `onAddPublication={…}`):

```tsx
        onFindDuplicates={() => setIsDupeCheckOpen(true)}
```

Mount the dialog next to `<AddImportDialog …>` (~line 1727):

```tsx
      <DuplicateCheckDialog
        open={isDupeCheckOpen}
        onOpenChange={setIsDupeCheckOpen}
        publications={publications}
        vaults={vaults.concat(sharedVaults)}
        vaultCopies={vaultPublicationLinks}
        onMergeComplete={() => {
          clearPageCache('dashboard');
          fetchData();
        }}
      />
```

(`vaultPublicationLinks` rows are `{ id, vault_id, original_publication_id }` — structurally a `VaultCopyRef[]`.)

- [ ] **Step 3: Gates**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/components/publications/PublicationList.tsx src/pages/Dashboard.tsx
```

- [ ] **Step 4: Manual verification (dev server)**

Run `npm run dev` and, with a test account that has some near-duplicate papers (import the same paper twice via BibTeX with a slightly different title/casing if needed):
1. all_papers toolbar shows `find_duplicates`; opens the wizard.
2. Adjust weights/threshold; `scan_library` lists the seeded pair with a sensible score breakdown.
3. `not_a_dupe` removes a pair for the session.
4. `resolve` → survivor defaults to older row; field conflicts pickable; merge succeeds; toast summarizes; library refreshes with one paper left holding merged fields.
5. Seed both papers into the same vault → resolve shows a per-vault annotation card; the chosen copy's notes survive in that vault.
6. `take_all_left` / `take_all_right` short-circuit correctly.

- [ ] **Step 5: Commit**

```bash
git add src/components/publications/PublicationList.tsx src/pages/Dashboard.tsx
git commit -m "Wire find_duplicates wizard into all_papers toolbar (#143, #145)"
```

---

### Task 6: Upgrade import-time duplicate checks to the shared scorer

**Files:**
- Modify: `src/components/publications/ImportDialog.tsx:75-92` (`checkForDuplicate`)
- Modify: `src/components/publications/AddImportDialog.tsx:125-137` (`checkForDuplicate`)

**Interfaces:**
- Consumes: Task 2's `DUPE_PRESETS`, `scorePair`.
- Produces: no API changes — both dialogs keep returning the matched `Publication | undefined`.

- [ ] **Step 1: Replace both naive checks**

In `src/components/publications/ImportDialog.tsx`, add the import and replace the whole `checkForDuplicate` helper:

```ts
import { DUPE_PRESETS, scorePair } from '@/lib/dupeDetection';
```

```ts
  // Duplicate checker helper — scored heuristic shared with the find_duplicates wizard
  const checkForDuplicate = (newPub: Partial<Publication>) => {
    const preset = DUPE_PRESETS.balanced;
    return allPublications.find((pub) => scorePair(newPub, pub, preset).score >= preset.threshold);
  };
```

In `src/components/publications/AddImportDialog.tsx`, same import, and replace the `useCallback` body:

```ts
  const checkForDuplicate = useCallback(
    (newPub: Partial<Publication>) => {
      const preset = DUPE_PRESETS.balanced;
      return allPublications.find((pub) => scorePair(newPub, pub, preset).score >= preset.threshold);
    },
    [allPublications],
  );
```

- [ ] **Step 2: Gates and manual spot-check**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/components/publications/ImportDialog.tsx src/components/publications/AddImportDialog.tsx
```

Manual: import a BibTeX entry whose title differs from an existing paper only by punctuation/accents — it must now be flagged as a possible duplicate (previously missed by exact match).

- [ ] **Step 3: Commit**

```bash
git add src/components/publications/ImportDialog.tsx src/components/publications/AddImportDialog.tsx
git commit -m "Use fuzzy dupe scorer for import-time duplicate warnings (#143)"
```

---

### Task 7: Version bump, changelogs, PR

**Files:**
- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md`, `src/config/changelog.ts`

- [ ] **Step 1: Bump minor version**

Set `package.json` version to the next minor above current `main` (expected `1.6.0` if the LaTeX PR shipped `1.5.0`; otherwise `1.5.0`), then:

```bash
npm install --package-lock-only
```

- [ ] **Step 2: CHANGELOG.md entry**

Add at the top (adjust version):

```markdown
## [1.6.0] - 2026-07-17

### Added
- `find_duplicates` wizard in all_papers: configure a scoring heuristic
  (title/author/year/venue weights + threshold, DOI exact-match override),
  review scored candidate pairs, and resolve them git-style with
  field-by-field picks and per-vault annotation choices. (#143, #145)

### Changed
- Import-time duplicate warnings now use the same fuzzy scorer instead of
  exact DOI/title matching, so accent, punctuation, and LaTeX-markup
  variants of an existing paper are caught. (#143)
```

- [ ] **Step 3: What's-new entry in `src/config/changelog.ts`**

Insert at the TOP of the array (use current max `id` + 1; expected `15`):

```ts
  {
    id: 15,
    date: '2026-07-17',
    title: 'find duplicates, resolve them git-style',
    features: [
      {
        tag: 'feature',
        title: 'find_duplicates wizard',
        description:
          'scan all_papers with a tunable heuristic — weight title, authors, year, and venue similarity — then resolve each pair git-style: pick surviving fields and choose whose notes and tags win per vault.',
      },
      {
        tag: 'improvement',
        title: 'smarter import duplicate warnings',
        description:
          'importing now catches duplicates that differ only in accents, punctuation, or latex markup instead of requiring an exact title match.',
      },
    ],
  },
```

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src/config/changelog.ts
git add package.json package-lock.json CHANGELOG.md src/config/changelog.ts
git commit -m "Bump version with find_duplicates changelog entries"
```

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin feature/find-duplicates
gh pr create --title "Add find_duplicates wizard with tunable scoring and git-style resolution" --body "Closes #143. Closes #145.

- new \`find_duplicates\` button in all_papers opens a 3-step wizard: configure heuristic (signal weights + threshold, presets), review scored pairs with per-signal breakdowns, resolve git-style
- resolution: field-by-field left/right picks over BIBLIOGRAPHIC_FIELDS, take_all_left/right, keep_both; per-vault annotation choice when both papers live in the same vault; losing copies re-pointed so nothing is silently lost
- pure, tested detection lib (normalization strips accents + latex markup; token-sort levenshtein, author jaccard, year ±1, venue similarity; DOI exact-match override; blocked candidate generation)
- import dialogs now warn using the same scorer instead of exact matching

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Expected: PR URL printed.
