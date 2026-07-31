import { describe, expect, it, vi } from 'vitest';
import { scanVaultHealth, groupHealthIssuesByType, runVaultHealthEnrichment, computeVaultHealthScore, getVaultHealthStatus } from './vaultHealthCheck';
import { Publication } from '@/types/database';

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 'pub-1', user_id: 'u1', title: 'A Paper', authors: ['Ada Lovelace'],
    year: 2024, journal: 'J', volume: null, issue: null, pages: null,
    doi: '10.1/abc', url: null, abstract: 'abs', pdf_url: 'https://x/y.pdf',
    bibtex_key: 'lovelace2024paper', publication_type: 'article', notes: null,
    booktitle: null, chapter: null, edition: null, editor: null, howpublished: null,
    institution: null, number: null, organization: null, publisher: null, school: null,
    series: null, type: null, eid: null,
    isbn: null, issn: null, keywords: null, reading_state: 'unread', important: false,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as Publication;
}

describe('scanVaultHealth', () => {
  it('flags a fully-populated publication with no issues', () => {
    expect(scanVaultHealth([makePub()])).toEqual([]);
  });

  it('flags missing_doi, missing_year, missing_abstract independently', () => {
    const issues = scanVaultHealth([makePub({ doi: null, year: null, abstract: null })]);
    const types = issues.map(i => i.type);
    expect(types).toEqual(expect.arrayContaining(['missing_doi', 'missing_year', 'missing_abstract']));
  });

  it('does not flag missing_url when a doi is present', () => {
    const issues = scanVaultHealth([makePub({ url: null, doi: '10.1/abc' })]);
    expect(issues.some(i => i.type === 'missing_url')).toBe(false);
  });

  it('flags missing_url only when both url and doi are absent', () => {
    const issues = scanVaultHealth([makePub({ url: null, doi: null })]);
    expect(issues.some(i => i.type === 'missing_url')).toBe(true);
  });

  it('flags malformed_bibtex_key for keys with invalid characters', () => {
    const issues = scanVaultHealth([makePub({ bibtex_key: 'bad key!' })]);
    expect(issues.some(i => i.type === 'malformed_bibtex_key')).toBe(true);
  });

  it('flags missing_authors for an empty authors array', () => {
    const issues = scanVaultHealth([makePub({ authors: [] })]);
    expect(issues.some(i => i.type === 'missing_authors')).toBe(true);
  });

  it('does not flag missing_year for year 0', () => {
    const issues = scanVaultHealth([makePub({ year: 0 })]);
    expect(issues.some(i => i.type === 'missing_year')).toBe(false);
  });

  it('accepts bibtex keys with valid special characters (colon, dot, dash, underscore)', () => {
    const issues = scanVaultHealth([makePub({ bibtex_key: 'lovelace_2024:paper-v2.final' })]);
    expect(issues.some(i => i.type === 'malformed_bibtex_key')).toBe(false);
  });

  it('flags near-duplicate publications as possible_duplicate', () => {
    const a = makePub({ id: 'a', title: 'Deep Learning for Graphs', authors: ['Ada Lovelace'], year: 2024, doi: null });
    const b = makePub({ id: 'b', title: 'Deep Learning for Graphs', authors: ['Ada Lovelace'], year: 2024, doi: null });
    const issues = scanVaultHealth([a, b]);
    expect(issues.some(i => i.type === 'possible_duplicate')).toBe(true);
  });

  it('does not flag unrelated publications as duplicates', () => {
    const a = makePub({ id: 'a', title: 'Deep Learning for Graphs', authors: ['Ada Lovelace'], year: 2024, doi: '10.1/aaa' });
    const b = makePub({ id: 'b', title: 'Quantum Computing Basics', authors: ['Grace Hopper'], year: 2010, doi: '10.1/bbb' });
    const issues = scanVaultHealth([a, b]);
    expect(issues.some(i => i.type === 'possible_duplicate')).toBe(false);
  });
});

describe('groupHealthIssuesByType', () => {
  it('groups issues by type', () => {
    const issues = scanVaultHealth([makePub({ doi: null, year: null })]);
    const grouped = groupHealthIssuesByType(issues);
    expect(grouped.missing_doi?.length).toBe(1);
    expect(grouped.missing_year?.length).toBe(1);
    expect(grouped.missing_abstract).toBeUndefined();
  });
});

vi.mock('@/lib/semanticScholar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/semanticScholar')>();
  return {
    ...actual,
    fetchSemanticScholarMetadataByDoi: vi.fn(async (doi: string) =>
      doi === '10.1/has-update'
        ? { title: 'Updated Title', authors: [], year: null, journal: null, doi, url: null, abstract: null, type: null }
        : null
    ),
  };
});

describe('runVaultHealthEnrichment', () => {
  it('skips publications without a DOI', async () => {
    const results = await runVaultHealthEnrichment([makePub({ id: 'no-doi', doi: null })]);
    expect(results).toEqual([]);
  });

  it('produces diffs for DOI-bearing publications with an available update', async () => {
    const results = await runVaultHealthEnrichment([
      makePub({ id: 'p1', doi: '10.1/has-update', title: 'Old Title' }),
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].diffs.some(d => d.field === 'title')).toBe(true);
  });

  it('produces an empty diff list when no match is found, without throwing', async () => {
    const results = await runVaultHealthEnrichment([makePub({ id: 'p2', doi: '10.1/no-match' })]);
    expect(results[0].diffs).toEqual([]);
  });
});

describe('computeVaultHealthScore', () => {
  it('scores an empty vault as 100 with zero complete/total', () => {
    expect(computeVaultHealthScore([], [])).toEqual({ scorePercent: 100, completeCount: 0, totalCount: 0 });
  });

  it('scores a vault with no issues as 100, all papers complete', () => {
    // Distinct titles/authors/years/DOIs so scanVaultHealth doesn't also flag these as duplicates of each other
    // (a shared DOI alone short-circuits findDuplicateCandidates to a perfect match regardless of other fields).
    const pubs = [
      makePub({ id: 'a', title: 'Paper A', authors: ['Ada Lovelace'], year: 2020, doi: '10.1/paper-a' }),
      makePub({ id: 'b', title: 'Paper B', authors: ['Grace Hopper'], year: 2021, doi: '10.1/paper-b' }),
    ];
    expect(computeVaultHealthScore(pubs, scanVaultHealth(pubs))).toEqual({
      scorePercent: 100, completeCount: 2, totalCount: 2,
    });
  });

  it('deducts proportionally to the number of missing field-checks, not just presence of any issue', () => {
    const pubs = [makePub({ id: 'a', doi: null, url: 'https://example.com/a' })]; // only 1 of 10 field checks fails (doi); url present so missing_url isn't also triggered
    const score = computeVaultHealthScore(pubs, scanVaultHealth(pubs));
    expect(score.scorePercent).toBe(90); // 1 - (1/10)
    expect(score.completeCount).toBe(0);
    expect(score.totalCount).toBe(1);
  });

  it('does not let possible_duplicate issues affect scorePercent (not a field check) but does exclude duplicated papers from completeCount', () => {
    const pubs = [
      makePub({ id: 'a', title: 'Same Title', authors: ['Ada Lovelace'], year: 2024 }),
      makePub({ id: 'b', title: 'Same Title', authors: ['Ada Lovelace'], year: 2024 }),
    ];
    const issues = scanVaultHealth(pubs);
    expect(issues.some(i => i.type === 'possible_duplicate')).toBe(true);

    const score = computeVaultHealthScore(pubs, issues);
    expect(score.scorePercent).toBe(100); // no field-level issues, only the pairwise duplicate flag
    expect(score.completeCount).toBe(0); // both papers are touched by the duplicate pair, so neither is "complete"
    expect(score.totalCount).toBe(2);
  });

  it('clamps to [0, 100] even in degenerate inputs', () => {
    const pubs = [makePub({ id: 'a', doi: null, title: '', authors: [], journal: null, booktitle: null, year: null, abstract: null, url: null, bibtex_key: null, pdf_url: null })];
    const score = computeVaultHealthScore(pubs, scanVaultHealth(pubs));
    expect(score.scorePercent).toBeGreaterThanOrEqual(0);
    expect(score.scorePercent).toBeLessThanOrEqual(100);
  });
});

describe('getVaultHealthStatus', () => {
  it('returns good for scores >= 80', () => {
    expect(getVaultHealthStatus(80)).toEqual({ level: 'good', label: 'healthy' });
    expect(getVaultHealthStatus(100)).toEqual({ level: 'good', label: 'healthy' });
  });

  it('returns warning for scores in [50, 80)', () => {
    expect(getVaultHealthStatus(79)).toEqual({ level: 'warning', label: 'needs attention' });
    expect(getVaultHealthStatus(50)).toEqual({ level: 'warning', label: 'needs attention' });
  });

  it('returns critical for scores below 50', () => {
    expect(getVaultHealthStatus(49)).toEqual({ level: 'critical', label: 'needs work' });
    expect(getVaultHealthStatus(0)).toEqual({ level: 'critical', label: 'needs work' });
  });
});
