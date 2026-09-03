import { describe, expect, it } from 'vitest';
import { applyFilters, type PublicationFilter } from './FilterBuilder';
import type { Publication } from '@/types/database';

function makePub(overrides: Partial<Publication>): Publication {
  return {
    id: overrides.id ?? 'id',
    user_id: 'user-1',
    title: 'Untitled',
    authors: [],
    year: null,
    journal: null,
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
    reading_state: 'unread',
    important: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('applyFilters — important', () => {
  it('filters to publications where important is true', () => {
    const pubs = [
      makePub({ id: 'a', important: true }),
      makePub({ id: 'b', important: false }),
    ];
    const filters: PublicationFilter[] = [
      { id: 'f1', field: 'important', operator: 'equals', value: 'true' },
    ];

    const result = applyFilters(pubs, filters, {}, {});
    expect(result.map((p) => p.id)).toEqual(['a']);
  });

  it('filters to publications where important is false', () => {
    const pubs = [
      makePub({ id: 'a', important: true }),
      makePub({ id: 'b', important: false }),
    ];
    const filters: PublicationFilter[] = [
      { id: 'f1', field: 'important', operator: 'equals', value: 'false' },
    ];

    const result = applyFilters(pubs, filters, {}, {});
    expect(result.map((p) => p.id)).toEqual(['b']);
  });
});

describe('applyFilters — vault', () => {
  it('matches a publication that belongs to the selected vault', () => {
    const pubs = [makePub({ id: 'a' }), makePub({ id: 'b' })];
    const filters: PublicationFilter[] = [
      { id: 'f1', field: 'vault', operator: 'equals', value: 'vault-1' },
    ];
    const publicationVaultsMap = { a: ['vault-1'], b: ['vault-2'] };

    const result = applyFilters(pubs, filters, {}, publicationVaultsMap);
    expect(result.map((p) => p.id)).toEqual(['a']);
  });

  it('matches a publication that belongs to several vaults, one of which is selected', () => {
    const pubs = [makePub({ id: 'a' })];
    const filters: PublicationFilter[] = [
      { id: 'f1', field: 'vault', operator: 'equals', value: 'vault-2' },
    ];
    const publicationVaultsMap = { a: ['vault-1', 'vault-2'] };

    const result = applyFilters(pubs, filters, {}, publicationVaultsMap);
    expect(result.map((p) => p.id)).toEqual(['a']);
  });

  it('excludes a publication not in the selected vault', () => {
    const pubs = [makePub({ id: 'a' })];
    const filters: PublicationFilter[] = [
      { id: 'f1', field: 'vault', operator: 'not_equals', value: 'vault-2' },
    ];
    const publicationVaultsMap = { a: ['vault-1'] };

    const result = applyFilters(pubs, filters, {}, publicationVaultsMap);
    expect(result.map((p) => p.id)).toEqual(['a']);
  });

  it('treats a publication with no vault entries as not matching any vault', () => {
    const pubs = [makePub({ id: 'a' })];
    const filters: PublicationFilter[] = [
      { id: 'f1', field: 'vault', operator: 'is_empty', value: '' },
    ];
    const result = applyFilters(pubs, filters, {}, {});
    expect(result.map((p) => p.id)).toEqual(['a']);
  });
});

describe('applyFilters — reading_state', () => {
  it('filters to publications equal to the selected reading_state', () => {
    const pubs = [
      makePub({ id: 'a', reading_state: 'unread' }),
      makePub({ id: 'b', reading_state: 'read' }),
    ];
    const filters: PublicationFilter[] = [
      { id: 'f1', field: 'reading_state', operator: 'equals', value: 'read' },
    ];

    const result = applyFilters(pubs, filters, {}, {});
    expect(result.map((p) => p.id)).toEqual(['b']);
  });
});
