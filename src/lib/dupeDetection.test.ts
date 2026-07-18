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
