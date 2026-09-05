import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Publication, PublicationRelation } from '@/types/database';
import type { SSPaper } from '@/lib/semanticScholar';

const mockLookupPaperByDOI = vi.fn();
const mockGetReferences = vi.fn();
const mockGetCitations = vi.fn();

vi.mock('@/lib/semanticScholar', () => ({
  lookupPaperByDOI: (...args: unknown[]) => mockLookupPaperByDOI(...args),
  getReferences: (...args: unknown[]) => mockGetReferences(...args),
  getCitations: (...args: unknown[]) => mockGetCitations(...args),
}));

import {
  fetchCitationGraph,
  buildSuggestionsFromCitationGraph,
  findRelationshipSuggestions,
} from './relationshipSuggestions';

afterEach(() => {
  vi.clearAllMocks();
});

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 'self', user_id: 'u1', title: 'Self Paper', authors: [], year: 2020,
    journal: null, volume: null, issue: null, pages: null, doi: '10.1/self', url: null,
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
    paperId: 'ss1', title: 'Untitled', authors: [], year: null, venue: null,
    citationCount: null, externalIds: null, abstract: null, url: null, openAccessPdfUrl: null,
    ...overrides,
  };
}

function makeRelation(overrides: Partial<PublicationRelation> = {}): PublicationRelation {
  return {
    id: 'r1', publication_id: 'a', related_publication_id: 'b', relation_type: 'cites',
    created_at: '', created_by: 'u1', ...overrides,
  };
}

describe('fetchCitationGraph', () => {
  it('returns null when the DOI cannot be resolved to a paper id', async () => {
    mockLookupPaperByDOI.mockResolvedValueOnce(null);
    expect(await fetchCitationGraph('10.1/missing')).toBeNull();
  });

  it('fetches references and citations for the resolved paper id', async () => {
    mockLookupPaperByDOI.mockResolvedValueOnce('DOI:10.1/self');
    mockGetReferences.mockResolvedValueOnce([makeSSPaper({ title: 'Ref' })]);
    mockGetCitations.mockResolvedValueOnce([makeSSPaper({ title: 'Cite' })]);

    const graph = await fetchCitationGraph('10.1/self');

    expect(mockGetReferences).toHaveBeenCalledWith('DOI:10.1/self');
    expect(mockGetCitations).toHaveBeenCalledWith('DOI:10.1/self');
    expect(graph?.references[0].title).toBe('Ref');
    expect(graph?.citations[0].title).toBe('Cite');
  });
});

describe('buildSuggestionsFromCitationGraph', () => {
  const self = { id: 'self', title: 'Self Paper' };

  it('suggests an outgoing edge when a reference matches a vault paper', () => {
    const vault = [makePub({ id: 'target', doi: '10.1/target', title: 'Target Paper' })];
    const graph = { references: [makeSSPaper({ title: 'Target Paper', externalIds: { DOI: '10.1/target' } })], citations: [] };

    const suggestions = buildSuggestionsFromCitationGraph(self, graph, vault, []);

    expect(suggestions).toEqual([
      { sourcePublicationId: 'self', sourceTitle: 'Self Paper', targetPublicationId: 'target', targetTitle: 'Target Paper', discoveredVia: 'references' },
    ]);
  });

  it('suggests an incoming edge when a citation matches a vault paper', () => {
    const vault = [makePub({ id: 'citer', doi: '10.1/citer', title: 'Citer Paper' })];
    const graph = { references: [], citations: [makeSSPaper({ title: 'Citer Paper', externalIds: { DOI: '10.1/citer' } })] };

    const suggestions = buildSuggestionsFromCitationGraph(self, graph, vault, []);

    expect(suggestions).toEqual([
      { sourcePublicationId: 'citer', sourceTitle: 'Citer Paper', targetPublicationId: 'self', targetTitle: 'Self Paper', discoveredVia: 'citations' },
    ]);
  });

  it('does not suggest an edge that already exists, in either direction', () => {
    const vault = [makePub({ id: 'target', doi: '10.1/target', title: 'Target Paper' })];
    const graph = { references: [makeSSPaper({ title: 'Target Paper', externalIds: { DOI: '10.1/target' } })], citations: [] };
    const existing = [makeRelation({ publication_id: 'self', related_publication_id: 'target' })];

    expect(buildSuggestionsFromCitationGraph(self, graph, vault, existing)).toEqual([]);
  });

  it('does not suggest an edge to a paper not in the vault', () => {
    const graph = { references: [makeSSPaper({ title: 'Unrelated', externalIds: { DOI: '10.1/unrelated' } })], citations: [] };
    expect(buildSuggestionsFromCitationGraph(self, graph, [], [])).toEqual([]);
  });

  it('never suggests a self-edge', () => {
    const vault = [makePub({ id: 'self', doi: '10.1/self', title: 'Self Paper' })];
    const graph = { references: [makeSSPaper({ title: 'Self Paper', externalIds: { DOI: '10.1/self' } })], citations: [] };
    expect(buildSuggestionsFromCitationGraph(self, graph, vault, [])).toEqual([]);
  });

  it('dedupes the same pair found via both references and citations', () => {
    const vault = [makePub({ id: 'other', doi: '10.1/other', title: 'Other Paper' })];
    const matched = makeSSPaper({ title: 'Other Paper', externalIds: { DOI: '10.1/other' } });
    const graph = { references: [matched], citations: [matched] };

    expect(buildSuggestionsFromCitationGraph(self, graph, vault, [])).toHaveLength(1);
  });
});

describe('findRelationshipSuggestions', () => {
  it('returns an empty list when the paper has no DOI', async () => {
    expect(await findRelationshipSuggestions({ id: 'self', doi: null, title: 'Self' }, [], [])).toEqual([]);
    expect(mockLookupPaperByDOI).not.toHaveBeenCalled();
  });

  it('returns an empty list when the DOI cannot be resolved', async () => {
    mockLookupPaperByDOI.mockResolvedValueOnce(null);
    expect(await findRelationshipSuggestions({ id: 'self', doi: '10.1/self', title: 'Self' }, [], [])).toEqual([]);
  });

  it('fetches and builds suggestions end to end', async () => {
    mockLookupPaperByDOI.mockResolvedValueOnce('DOI:10.1/self');
    mockGetReferences.mockResolvedValueOnce([makeSSPaper({ title: 'Target Paper', externalIds: { DOI: '10.1/target' } })]);
    mockGetCitations.mockResolvedValueOnce([]);
    const vault = [makePub({ id: 'target', doi: '10.1/target', title: 'Target Paper' })];

    const suggestions = await findRelationshipSuggestions({ id: 'self', doi: '10.1/self', title: 'Self Paper' }, vault, []);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].targetPublicationId).toBe('target');
  });
});
