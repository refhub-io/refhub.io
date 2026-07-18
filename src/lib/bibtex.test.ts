import { describe, expect, it, vi } from 'vitest';

import { Publication } from '@/types/database';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/lib/apiKeys', () => ({
  getBackendApiBaseUrl: vi.fn(),
}));

import { generateBibtexKey, normalizeBibtexImportText, parseBibtex, publicationToBibtex } from './bibtex';

const publication = (overrides: Partial<Publication> = {}): Publication => ({
  id: 'pub-1',
  user_id: 'user-1',
  title: 'Über naïve visualization & analysis',
  authors: ['Müller, Jörg', 'García, Ana'],
  year: 2024,
  journal: 'Journal of crème brûlée studies',
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
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
  ...overrides,
});

describe('normalizeBibtexImportText', () => {
  it('decodes common LaTeX accent macros to Unicode', () => {
    expect(normalizeBibtexImportText(String.raw`M{\"u}ller, Garc{\'i}a, Fran{\c c}ois, {\v S}imek`)).toBe(
      'Müller, García, François, Šimek'
    );
  });

  it('decodes common LaTeX special letter commands', () => {
    expect(normalizeBibtexImportText(String.raw`{\AE}ther, {\O}resund, Stra{\ss}e`)).toBe('Æther, Øresund, Straße');
  });
});

describe('parseBibtex', () => {
  it('normalizes LaTeX accent macros while importing fields', () => {
    const [parsed] = parseBibtex(String.raw`
      @article{muller2024,
        title = {M{\"u}ller's {\v S}tudy of Cr{\`e}me Br{\^u}l{\'e}e},
        author = {M{\"u}ller, J{\"o}rg and Garc{\'i}a, Ana},
        journal = {Proceedings of Fran{\c c}ois Research},
        year = {2024},
        keywords = {na{\"i}ve Bayes, fa{\c c}ade}
      }
    `);

    expect(parsed.title).toBe("Müller's Študy of Crème Brûlée");
    expect(parsed.authors).toEqual(['Müller, Jörg', 'García, Ana']);
    expect(parsed.journal).toBe('Proceedings of François Research');
    expect(parsed.keywords).toEqual(['naïve Bayes', 'façade']);
  });
});

describe('publicationToBibtex', () => {
  it('exports Unicode accents and BibTeX-special text as portable LaTeX escapes', () => {
    const bibtex = publicationToBibtex(publication(), ['title', 'author', 'journal']);

    expect(bibtex).toContain(String.raw`title = {{\"{U}}ber na{\"{i}}ve visualization \& analysis}`);
    expect(bibtex).toContain(String.raw`author = {M{\"{u}}ller, J{\"{o}}rg and Garc{\'{i}}a, Ana}`);
    expect(bibtex).toContain(String.raw`journal = {Journal of cr{\`{e}}me br{\^{u}}l{\'{e}}e studies}`);
  });
});

describe('generateBibtexKey', () => {
  it('strips accents from generated keys', () => {
    expect(generateBibtexKey(publication())).toBe('jorg2024uber');
  });
});
