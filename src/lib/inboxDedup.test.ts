// src/lib/inboxDedup.test.ts
import { describe, expect, it } from 'vitest';
import { findDuplicateForItem } from './inboxDedup';
import type { Publication } from '@/types/database';

function makePublication(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 'pub-1', user_id: 'user-1', title: 'Attention Is All You Need',
    authors: ['Vaswani'], year: 2017, journal: null, volume: null, issue: null, pages: null,
    doi: '10.1/attn', url: null, abstract: null, pdf_url: null, bibtex_key: null,
    publication_type: 'article', notes: null, booktitle: null, chapter: null, edition: null,
    editor: null, howpublished: null, institution: null, number: null, organization: null,
    publisher: null, school: null, series: null, type: null, eid: null, isbn: null, issn: null,
    keywords: null, reading_state: 'unread', important: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('findDuplicateForItem', () => {
  it('returns the matching publication for a near-identical title/author/year', () => {
    const existing = [makePublication()];
    const result = findDuplicateForItem(
      { title: 'Attention is all you need', authors: ['Vaswani'], year: 2017 },
      existing,
    );
    expect(result?.id).toBe('pub-1');
  });

  it('returns null when nothing scores above the strict threshold', () => {
    const existing = [makePublication({ title: 'A completely different paper', authors: ['Someone Else'], year: 2010 })];
    const result = findDuplicateForItem({ title: 'Attention is all you need', authors: ['Vaswani'], year: 2017 }, existing);
    expect(result).toBeNull();
  });

  it('returns null for an empty library', () => {
    expect(findDuplicateForItem({ title: 'Anything' }, [])).toBeNull();
  });
});
