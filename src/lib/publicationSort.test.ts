import { describe, expect, it } from 'vitest';
import { comparePublications, SORT_FIELD_OPTIONS } from './publicationSort';
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

describe('comparePublications — reading_state', () => {
  it('orders unread < skimmed < read ascending', () => {
    const unread = makePub({ id: 'a', reading_state: 'unread' });
    const skimmed = makePub({ id: 'b', reading_state: 'skimmed' });
    const read = makePub({ id: 'c', reading_state: 'read' });

    expect(comparePublications(unread, skimmed, 'reading_state', 'asc')).toBeLessThan(0);
    expect(comparePublications(skimmed, read, 'reading_state', 'asc')).toBeLessThan(0);
    expect(comparePublications(read, unread, 'reading_state', 'desc')).toBeLessThan(0);
  });
});

describe('comparePublications — important', () => {
  it('sorts true before false descending (true-first)', () => {
    const important = makePub({ id: 'a', important: true });
    const notImportant = makePub({ id: 'b', important: false });

    expect(comparePublications(important, notImportant, 'important', 'desc')).toBeLessThan(0);
    expect(comparePublications(notImportant, important, 'important', 'asc')).toBeLessThan(0);
  });
});

describe('SORT_FIELD_OPTIONS', () => {
  it('includes reading_state and important with sensible default directions', () => {
    const readingState = SORT_FIELD_OPTIONS.find((o) => o.field === 'reading_state');
    const important = SORT_FIELD_OPTIONS.find((o) => o.field === 'important');

    expect(readingState?.defaultDirection).toBe('asc');
    expect(important?.defaultDirection).toBe('desc');
  });
});
