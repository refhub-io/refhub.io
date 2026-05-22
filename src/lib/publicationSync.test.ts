import { describe, expect, it } from 'vitest';
import { createPublicationSyncPatch, getPublicationSyncDiffs } from './publicationSync';
import { Publication } from '@/types/database';
import { SemanticScholarMetadata } from './semanticScholar';

const basePublication: Publication = {
  id: 'pub-1',
  user_id: 'user-1',
  title: 'Old title',
  authors: [],
  year: null,
  journal: null,
  volume: null,
  issue: null,
  pages: null,
  doi: '10.123/example',
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
  created_at: '2026-05-21T00:00:00Z',
  updated_at: '2026-05-21T00:00:00Z',
};

describe('publication sync patch', () => {
  it('maps all Semantic Scholar sync fields to persisted publication fields', () => {
    const metadata: SemanticScholarMetadata = {
      title: 'New title',
      authors: ['Ada Lovelace', 'Grace Hopper'],
      year: 2026,
      journal: 'Journal of Tiny Regressions',
      doi: '10.123/example',
      url: 'https://example.test/paper',
      abstract: 'Updated abstract',
      type: 'conference',
    };

    const diffs = getPublicationSyncDiffs(basePublication, metadata);
    const patch = createPublicationSyncPatch(diffs);

    expect(patch).toMatchObject({
      title: metadata.title,
      authors: metadata.authors,
      year: metadata.year,
      journal: metadata.journal,
      url: metadata.url,
      abstract: metadata.abstract,
      publication_type: metadata.type,
    });
    expect(patch).not.toHaveProperty('type');
  });
});
