import { describe, expect, it } from 'vitest';
import { findMatchingPublication, isAlreadyInVault } from './publicationMatching';
import type { Publication } from '@/types/database';
import type { SSPaper } from '@/lib/semanticScholar';

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 'p1', user_id: 'u1', title: 'A Paper', authors: ['A. Author'], year: 2020,
    journal: null, volume: null, issue: null, pages: null, doi: '10.1/abc', url: null,
    abstract: null, pdf_url: null, bibtex_key: null, publication_type: 'article', notes: null,
    booktitle: null, chapter: null, edition: null, editor: null, howpublished: null,
    institution: null, number: null, organization: null, publisher: null, school: null,
    series: null, type: null, eid: null, isbn: null, issn: null, keywords: null,
    reading_state: 'unread', important: false, created_at: '', updated_at: '',
    ...overrides,
  };
}

function makeSSPaper(overrides: Partial<SSPaper> = {}): SSPaper {
  return {
    paperId: 'ss1', title: 'A Paper', authors: [], year: 2020, venue: null,
    citationCount: null, externalIds: null, abstract: null, url: null, openAccessPdfUrl: null,
    ...overrides,
  };
}

describe('findMatchingPublication', () => {
  it('matches by DOI, case-insensitively', () => {
    const vault = [makePub({ id: 'v1', doi: '10.1/ABC' })];
    const paper = makeSSPaper({ externalIds: { DOI: '10.1/abc' } });
    expect(findMatchingPublication(paper, vault)?.id).toBe('v1');
  });

  it('falls back to title match, case-insensitively and trimmed, when there is no DOI match', () => {
    const vault = [makePub({ id: 'v1', doi: null, title: '  Some Title  ' })];
    const paper = makeSSPaper({ externalIds: null, title: 'some title' });
    expect(findMatchingPublication(paper, vault)?.id).toBe('v1');
  });

  it('prefers a DOI match over a title match when both are present in the vault', () => {
    const vault = [
      makePub({ id: 'by-title', doi: null, title: 'A Paper' }),
      makePub({ id: 'by-doi', doi: '10.1/xyz', title: 'Different Title' }),
    ];
    const paper = makeSSPaper({ externalIds: { DOI: '10.1/xyz' }, title: 'A Paper' });
    expect(findMatchingPublication(paper, vault)?.id).toBe('by-doi');
  });

  it('returns null when nothing matches', () => {
    const vault = [makePub({ id: 'v1', doi: '10.1/other', title: 'Other Title' })];
    const paper = makeSSPaper({ externalIds: { DOI: '10.1/abc' }, title: 'A Paper' });
    expect(findMatchingPublication(paper, vault)).toBeNull();
  });
});

describe('isAlreadyInVault', () => {
  it('is true when findMatchingPublication would find a match', () => {
    const vault = [makePub({ id: 'v1', doi: '10.1/abc' })];
    expect(isAlreadyInVault(makeSSPaper({ externalIds: { DOI: '10.1/abc' } }), vault)).toBe(true);
  });

  it('is false when nothing matches', () => {
    expect(isAlreadyInVault(makeSSPaper({ externalIds: { DOI: '10.1/nope' } }), [])).toBe(false);
  });
});
