import { describe, expect, it } from 'vitest';

import {
  DUPE_PRESETS,
  findDuplicateCandidates,
  lastNameJaccard,
  normalizeBiblioString,
  normalizeDoi,
  normalizeLastName,
  scorePair,
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
