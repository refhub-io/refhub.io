import { describe, expect, it, vi } from 'vitest';
import { scanVaultHealth, groupHealthIssuesByType, runVaultHealthEnrichment } from './vaultHealthCheck';
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
