import { describe, expect, it } from 'vitest';
import { formatCSV } from './export';
import { Publication } from '@/types/database';

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 'pub-1',
    user_id: 'user-1',
    title: 'A Paper',
    authors: ['Ada Lovelace', 'Grace Hopper'],
    year: 2024,
    journal: 'Journal of Things',
    volume: null,
    issue: null,
    pages: null,
    doi: '10.1234/abc',
    url: null,
    abstract: 'An abstract.',
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
    ...overrides,
  } as Publication;
}

describe('formatCSV', () => {
  it('emits a header row followed by one row per publication', () => {
    const csv = formatCSV([makePub()]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('title,authors,year,venue,doi,url,abstract,tags,notes,refhub_id');
    expect(lines[1]).toBe('A Paper,Ada Lovelace; Grace Hopper,2024,Journal of Things,10.1234/abc,,An abstract.,,,pub-1');
  });

  it('falls back to booktitle when journal is absent', () => {
    const csv = formatCSV([makePub({ journal: null, booktitle: 'Proc. of Things' })]);
    expect(csv.split('\r\n')[1]).toContain('Proc. of Things');
  });

  it('quotes fields containing commas, quotes, or newlines', () => {
    const csv = formatCSV([makePub({ title: 'Title, with a "quote"\nand newline' })]);
    const dataLine = csv.split('\r\n').slice(1).join('\n'); // rejoin since title itself has \n
    expect(dataLine.startsWith('"Title, with a ""quote""\nand newline"')).toBe(true);
  });

  it('injects tags from the optional tagsByPublicationId map', () => {
    const csv = formatCSV([makePub({ id: 'pub-2' })], { 'pub-2': 'nlp; graphs' });
    expect(csv.split('\r\n')[1]).toContain('nlp; graphs');
  });

  it('handles an empty publication list by returning just the header', () => {
    const csv = formatCSV([]);
    expect(csv).toBe('title,authors,year,venue,doi,url,abstract,tags,notes,refhub_id');
  });
});
