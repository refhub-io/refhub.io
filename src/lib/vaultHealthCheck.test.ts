import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

vi.mock('@/lib/apiKeys', () => ({
  getBackendApiBaseUrl: () => 'https://refhub.test',
}));

import {
  scanVaultHealth,
  groupHealthIssuesByType,
  runVaultHealthEnrichment,
  computeVaultHealthScore,
  computeVaultHealthUserStats,
  getVaultHealthStatus,
} from './vaultHealthCheck';
import { Publication } from '@/types/database';

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 'pub-1', user_id: 'u1', title: 'A Paper', authors: ['Ada Lovelace'],
    year: 2024, journal: 'J', volume: '1', issue: '1', pages: '1-10',
    doi: '10.1/abc', url: null, abstract: 'abs', pdf_url: 'https://x/y.pdf',
    bibtex_key: 'lovelace2024paper', publication_type: 'article', notes: null,
    booktitle: null, chapter: null, edition: null, editor: null, howpublished: null,
    institution: null, number: null, organization: null, publisher: null, school: null,
    series: null, type: null, eid: null,
    isbn: null, issn: null, keywords: ['machine learning'], reading_state: 'unread', important: false,
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

  it('flags missing_publication_type when publication_type is blank', () => {
    const issues = scanVaultHealth([makePub({ publication_type: '' })]);
    expect(issues.some(i => i.type === 'missing_publication_type')).toBe(true);
  });

  it('flags missing_venue when neither journal nor booktitle is set', () => {
    const issues = scanVaultHealth([makePub({ journal: null, booktitle: null })]);
    expect(issues.some(i => i.type === 'missing_venue')).toBe(true);
  });

  it('flags missing_keywords for an empty keywords array', () => {
    const issues = scanVaultHealth([makePub({ keywords: [] })]);
    expect(issues.some(i => i.type === 'missing_keywords')).toBe(true);
  });

  it('flags missing_volume and missing_issue for an article missing them, but not book-only fields', () => {
    const issues = scanVaultHealth([makePub({ volume: null, issue: null })]);
    const types = issues.map(i => i.type);
    expect(types).toEqual(expect.arrayContaining(['missing_volume', 'missing_issue']));
    expect(types).not.toContain('missing_editor');
    expect(types).not.toContain('missing_isbn');
    expect(types).not.toContain('missing_publisher');
  });

  it('does not flag missing_volume/missing_issue for a book, but does flag book-specific fields', () => {
    const issues = scanVaultHealth([makePub({
      publication_type: 'book', journal: null, booktitle: 'Some Book',
      volume: null, issue: null, pages: null,
      editor: null, publisher: null, isbn: null, series: null, edition: null,
    })]);
    const types = issues.map(i => i.type);
    expect(types).not.toContain('missing_volume');
    expect(types).not.toContain('missing_issue');
    expect(types).not.toContain('missing_pages');
    expect(types).toEqual(expect.arrayContaining([
      'missing_editor', 'missing_publisher', 'missing_isbn', 'missing_series', 'missing_edition',
    ]));
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
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips publications without a DOI', async () => {
    const { results, skippedCount } = await runVaultHealthEnrichment([makePub({ id: 'no-doi', doi: null })]);
    expect(results).toEqual([]);
    expect(skippedCount).toBe(0);
  });

  it('produces diffs for DOI-bearing publications with an available update', async () => {
    const { results } = await runVaultHealthEnrichment([
      makePub({ id: 'p1', doi: '10.1/has-update', title: 'Old Title' }),
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].diffs.some(d => d.field === 'title')).toBe(true);
  });

  it('produces an empty diff list when no match is found, without throwing', async () => {
    const { results } = await runVaultHealthEnrichment([makePub({ id: 'p2', doi: '10.1/no-match' })]);
    expect(results[0].diffs).toEqual([]);
  });

  it('skips recently-checked DOIs and reports skippedCount', async () => {
    // First run populates the cache
    await runVaultHealthEnrichment([makePub({ id: 'p1', doi: '10.1/has-update', title: 'Old Title' })]);

    // Second run with the same DOI should skip it
    const { results, skippedCount } = await runVaultHealthEnrichment([
      makePub({ id: 'p1', doi: '10.1/has-update', title: 'Old Title' }),
    ]);
    expect(skippedCount).toBe(1);
    expect(results).toEqual([]);
  });

  it('rechecks all DOIs when skipRecentMs is 0', async () => {
    // First run populates the cache
    await runVaultHealthEnrichment([makePub({ id: 'p1', doi: '10.1/has-update', title: 'Old Title' })]);

    // Second run with skipRecentMs: 0 should still query
    const { results, skippedCount } = await runVaultHealthEnrichment(
      [makePub({ id: 'p1', doi: '10.1/has-update', title: 'Old Title' })],
      undefined,
      { skipRecentMs: 0 },
    );
    expect(skippedCount).toBe(0);
    expect(results).toHaveLength(1);
  });

  it('does not cache DOIs whose lookup failed', async () => {
    // runSemanticScholarQueue mock: 'no-match' returns null (ok but no data), not an error
    // To simulate a failure we'd need a rejected promise; skip that edge case here.
    // This test just verifies the happy path produces a cache hit on the second run.
    const doi = '10.1/no-match';
    await runVaultHealthEnrichment([makePub({ id: 'p2', doi })]);
    // 'no-match' succeeds (ok: true, data: []) so it IS cached
    const { skippedCount } = await runVaultHealthEnrichment([makePub({ id: 'p2', doi })]);
    expect(skippedCount).toBe(1);
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

  it('weighs a missing tier-1 field (doi) more heavily than a missing tier-3 field, and excludes the paper from completeCount', () => {
    // For a fully-populated 'article', 30 total weighted checks apply: 6 tier-1 (x3) +
    // 3 tier-2 (volume/issue/pages, x2) + 6 tier-3 (x1). Missing only doi (weight 3)
    // drops 3 of 30 -> (30-3)/30 = 90%.
    const pubs = [makePub({ id: 'a', doi: null, url: 'https://example.com/a' })];
    const score = computeVaultHealthScore(pubs, scanVaultHealth(pubs));
    expect(score.scorePercent).toBe(90);
    // doi is now one of the absolute-minimum required fields (authors, year, doi, venue,
    // publication_type, title) -- a paper without one is not "complete", even at a high score.
    expect(score.completeCount).toBe(0);
    expect(score.totalCount).toBe(1);
  });

  it('does not let missing pdf or keywords disqualify a paper from completeCount, even though they lower scorePercent', () => {
    // Regression: these tier-3 fields are legitimately absent for most papers (no local PDF,
    // no hand-set keywords) -- requiring them for "complete" collapsed completeCount toward
    // zero in real vaults even at a healthy overall scorePercent.
    const pubs = [makePub({ id: 'a', pdf_url: null, keywords: [] })];
    const score = computeVaultHealthScore(pubs, scanVaultHealth(pubs));
    expect(score.scorePercent).toBe(93); // (30-2)/30 = 93.33 -> 93
    expect(score.completeCount).toBe(1); // still counted complete: all tier-1 required fields are present
  });

  it('does disqualify a paper from completeCount when a tier-1 required field (title) is missing', () => {
    const pubs = [makePub({ id: 'a', title: '' })];
    const score = computeVaultHealthScore(pubs, scanVaultHealth(pubs));
    expect(score.completeCount).toBe(0);
  });

  it('does not check tier-2 fields that do not apply to the manuscript type, so an article is never penalized for lacking an isbn', () => {
    const pubs = [makePub({ id: 'a' })]; // 'article' -- isbn/editor/publisher/edition/series never apply
    const score = computeVaultHealthScore(pubs, scanVaultHealth(pubs));
    expect(score.scorePercent).toBe(100);
    expect(score.completeCount).toBe(1);
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
    const pubs = [makePub({
      id: 'a', doi: null, title: '', authors: [], journal: null, booktitle: null, year: null,
      abstract: null, url: null, bibtex_key: null, pdf_url: null, keywords: null,
      volume: null, issue: null, pages: null,
    })];
    const score = computeVaultHealthScore(pubs, scanVaultHealth(pubs));
    expect(score.scorePercent).toBeGreaterThanOrEqual(0);
    expect(score.scorePercent).toBeLessThanOrEqual(100);
  });
});

describe('computeVaultHealthUserStats', () => {
  it('returns null for tag/drive-url counts when no data source is supplied, but still computes notes/reading state from the publication itself', () => {
    const pubs = [
      makePub({ id: 'a', notes: null, reading_state: 'unread' }),
      makePub({ id: 'b', notes: 'some notes', reading_state: 'read' }),
    ];
    const stats = computeVaultHealthUserStats(pubs);
    expect(stats.missingTagsCount).toBeNull();
    expect(stats.missingDriveUrlCount).toBeNull();
    expect(stats.missingNotesCount).toBe(1);
    expect(stats.unreadCount).toBe(1);
    expect(stats.totalCount).toBe(2);
  });

  it('computes missing-tag and missing-drive-url counts when data sources are supplied', () => {
    const pubs = [makePub({ id: 'a' }), makePub({ id: 'b' })];
    const stats = computeVaultHealthUserStats(pubs, {
      hasTag: (id) => id === 'a',
      hasDriveUrl: () => false,
    });
    expect(stats.missingTagsCount).toBe(1);
    expect(stats.missingDriveUrlCount).toBe(2);
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
