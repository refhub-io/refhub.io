import { describe, expect, it } from 'vitest';
import { normalizeTopic, topicToSlug, slugToTopic, matchPublicationsForTopic, type PublicCodexPublication } from './codexDiscovery';
import type { Publication, Vault, Tag, PublicationRelation } from '@/types/database';

describe('normalizeTopic', () => {
  it('lowercases, trims, and collapses internal whitespace', () => {
    expect(normalizeTopic('  Graph   Drawing  ')).toBe('graph drawing');
  });

  it('treats different-cased/whitespaced variants as the same topic', () => {
    expect(normalizeTopic('Visual Storytelling')).toBe(normalizeTopic('visual   storytelling'));
  });
});

describe('topicToSlug / slugToTopic', () => {
  it('round-trips a simple topic through slug and back', () => {
    const topic = normalizeTopic('graph drawing');
    const slug = topicToSlug(topic);
    expect(slug).toBe('graph-drawing');
    expect(slugToTopic(slug)).toBe('graph drawing');
  });

  it('slugifies a single-word topic without hyphens', () => {
    expect(topicToSlug(normalizeTopic('uncertainty'))).toBe('uncertainty');
  });
});

const makeVault = (id: string): Vault => ({
  id,
  user_id: 'owner-1',
  name: `Vault ${id}`,
  description: null,
  color: '#000000',
  visibility: 'public',
  public_slug: id,
  category: null,
  abstract: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const makePublication = (id: string, overrides: Partial<Publication> = {}): Publication => ({
  id,
  user_id: 'owner-1',
  title: `Paper ${id}`,
  authors: ['A. Author'],
  year: 2026,
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
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeTag = (id: string, name: string): Tag => ({
  id,
  user_id: 'owner-1',
  name,
  color: '#ffffff',
  parent_id: null,
  depth: 0,
  created_at: '2026-01-01T00:00:00Z',
});

describe('matchPublicationsForTopic', () => {
  const vault = makeVault('v1');

  it('matches on a tag name (normalized)', () => {
    const pub = makePublication('p1');
    const corpus: PublicCodexPublication[] = [{ publication: pub, vault, tags: [makeTag('t1', 'Graph Drawing')] }];
    const matches = matchPublicationsForTopic('graph drawing', corpus, []);
    expect(matches).toHaveLength(1);
    expect(matches[0].signals).toEqual([{ type: 'tag', value: 'Graph Drawing' }]);
  });

  it('matches on a keyword entry (normalized)', () => {
    const pub = makePublication('p1', { keywords: ['Uncertainty Visualization'] });
    const corpus: PublicCodexPublication[] = [{ publication: pub, vault, tags: [] }];
    const matches = matchPublicationsForTopic('uncertainty visualization', corpus, []);
    expect(matches).toHaveLength(1);
    expect(matches[0].signals).toEqual([{ type: 'keyword', value: 'Uncertainty Visualization' }]);
  });

  it('matches on notes containing the topic text, case-insensitively', () => {
    const pub = makePublication('p1', { notes: 'Great primer on Graph Drawing techniques.' });
    const corpus: PublicCodexPublication[] = [{ publication: pub, vault, tags: [] }];
    const matches = matchPublicationsForTopic('graph drawing', corpus, []);
    expect(matches).toHaveLength(1);
    expect(matches[0].signals).toEqual([{ type: 'notes', snippet: 'Great primer on Graph Drawing techniques.' }]);
  });

  it('does not match unrelated publications', () => {
    const pub = makePublication('p1', { keywords: ['Something Else'] });
    const corpus: PublicCodexPublication[] = [{ publication: pub, vault, tags: [] }];
    expect(matchPublicationsForTopic('graph drawing', corpus, [])).toHaveLength(0);
  });

  it('carries multiple signals when a publication matches more than one way', () => {
    const pub = makePublication('p1', { keywords: ['Graph Drawing'] });
    const corpus: PublicCodexPublication[] = [{ publication: pub, vault, tags: [makeTag('t1', 'graph drawing')] }];
    const matches = matchPublicationsForTopic('graph drawing', corpus, []);
    expect(matches).toHaveLength(1);
    expect(matches[0].signals).toHaveLength(2);
    expect(matches[0].signals.map((s) => s.type).sort()).toEqual(['keyword', 'tag']);
  });

  it('includes a one-hop citation-related publication with a distinct citation signal', () => {
    const directPub = makePublication('p1', { keywords: ['Graph Drawing'] });
    const citedPub = makePublication('p2'); // no direct signal
    const corpus: PublicCodexPublication[] = [
      { publication: directPub, vault, tags: [] },
      { publication: citedPub, vault, tags: [] },
    ];
    const relations: PublicationRelation[] = [
      { id: 'r1', publication_id: 'p1', related_publication_id: 'p2', relation_type: 'cites', created_at: '2026-01-01T00:00:00Z', created_by: 'owner-1' },
    ];
    const matches = matchPublicationsForTopic('graph drawing', corpus, relations);
    expect(matches).toHaveLength(2);
    const citedMatch = matches.find((m) => m.publication.id === 'p2');
    expect(citedMatch?.signals).toEqual([{ type: 'citation', viaPublicationId: 'p1' }]);
  });

  it('never merges a citation signal into a publication that also has a direct signal', () => {
    // p2 has its own direct match AND is cited by p1's match — should show both, not collapse to one.
    const directPub = makePublication('p1', { keywords: ['Graph Drawing'] });
    const bothPub = makePublication('p2', { keywords: ['Graph Drawing'] });
    const corpus: PublicCodexPublication[] = [
      { publication: directPub, vault, tags: [] },
      { publication: bothPub, vault, tags: [] },
    ];
    const relations: PublicationRelation[] = [
      { id: 'r1', publication_id: 'p1', related_publication_id: 'p2', relation_type: 'cites', created_at: '2026-01-01T00:00:00Z', created_by: 'owner-1' },
    ];
    const matches = matchPublicationsForTopic('graph drawing', corpus, relations);
    const p2Match = matches.find((m) => m.publication.id === 'p2');
    expect(p2Match?.signals).toEqual([{ type: 'keyword', value: 'Graph Drawing' }]);
  });
});

import {
  deriveRelatedTopics,
  applyTopicFacets,
  sortTopicMatches,
  countNewInLastDays,
  type TopicMatch,
} from './codexDiscovery';

const makeMatch = (id: string, overrides: Partial<Publication> = {}, tags: Tag[] = []): TopicMatch => ({
  publication: makePublication(id, overrides),
  vault: makeVault('v1'),
  signals: [{ type: 'tag', value: 'graph drawing' }],
});

describe('deriveRelatedTopics', () => {
  it('surfaces other tags/keywords co-occurring on matched papers, excluding the topic itself', () => {
    const pub = makePublication('p1', { keywords: ['Graph Drawing', 'Network Visualization'] });
    const matches: TopicMatch[] = [{ publication: pub, vault: makeVault('v1'), signals: [{ type: 'keyword', value: 'Graph Drawing' }] }];
    expect(deriveRelatedTopics('graph drawing', matches)).toEqual(['network visualization']);
  });

  it('returns an empty list when there is no co-occurring topic', () => {
    const pub = makePublication('p1', { keywords: ['Graph Drawing'] });
    const matches: TopicMatch[] = [{ publication: pub, vault: makeVault('v1'), signals: [{ type: 'keyword', value: 'Graph Drawing' }] }];
    expect(deriveRelatedTopics('graph drawing', matches)).toEqual([]);
  });
});

describe('applyTopicFacets', () => {
  it('filters by year', () => {
    const matches = [makeMatch('p1', { year: 2024 }), makeMatch('p2', { year: 2026 })];
    expect(applyTopicFacets(matches, { year: 2026 }).map((m) => m.publication.id)).toEqual(['p2']);
  });

  it('filters by author (case-insensitive substring)', () => {
    const matches = [makeMatch('p1', { authors: ['Jane Doe'] }), makeMatch('p2', { authors: ['John Smith'] })];
    expect(applyTopicFacets(matches, { author: 'doe' }).map((m) => m.publication.id)).toEqual(['p1']);
  });

  it('filters by venue (journal, case-insensitive substring)', () => {
    const matches = [makeMatch('p1', { journal: 'IEEE VIS' }), makeMatch('p2', { journal: 'CHI' })];
    expect(applyTopicFacets(matches, { venue: 'vis' }).map((m) => m.publication.id)).toEqual(['p1']);
  });

  it('combines multiple facets with AND semantics', () => {
    const matches = [
      makeMatch('p1', { year: 2026, journal: 'IEEE VIS' }),
      makeMatch('p2', { year: 2026, journal: 'CHI' }),
    ];
    expect(applyTopicFacets(matches, { year: 2026, venue: 'vis' }).map((m) => m.publication.id)).toEqual(['p1']);
  });
});

describe('sortTopicMatches', () => {
  it('ranks direct matches above citation-only matches under relevance', () => {
    const direct = makeMatch('p1');
    const citationOnly: TopicMatch = { ...makeMatch('p2'), signals: [{ type: 'citation', viaPublicationId: 'p1' }] };
    const sorted = sortTopicMatches([citationOnly, direct], 'relevance', {}, {});
    expect(sorted.map((m) => m.publication.id)).toEqual(['p1', 'p2']);
  });

  it('sorts by most recent created_at', () => {
    const older = makeMatch('p1', { created_at: '2026-01-01T00:00:00Z' });
    const newer = makeMatch('p2', { created_at: '2026-06-01T00:00:00Z' });
    expect(sortTopicMatches([older, newer], 'recent', {}, {}).map((m) => m.publication.id)).toEqual(['p2', 'p1']);
  });

  it('sorts by vault popularity (favorites + forks)', () => {
    const inQuiet = makeMatch('p1');
    const inPopular: TopicMatch = { ...makeMatch('p2'), vault: makeVault('v2') };
    const popularity = { v1: { favorites: 0, forks: 0 }, v2: { favorites: 10, forks: 5 } };
    expect(sortTopicMatches([inQuiet, inPopular], 'popular', popularity, {}).map((m) => m.publication.id)).toEqual(['p2', 'p1']);
  });

  it('sorts by citation connection count', () => {
    const lessConnected = makeMatch('p1');
    const moreConnected = makeMatch('p2');
    const relationCounts = { p1: 1, p2: 4 };
    expect(sortTopicMatches([lessConnected, moreConnected], 'connected', {}, relationCounts).map((m) => m.publication.id)).toEqual(['p2', 'p1']);
  });
});

describe('countNewInLastDays', () => {
  it('counts only matches created within the window', () => {
    const now = new Date('2026-08-30T00:00:00Z');
    const recent = makeMatch('p1', { created_at: '2026-08-20T00:00:00Z' });
    const old = makeMatch('p2', { created_at: '2026-01-01T00:00:00Z' });
    expect(countNewInLastDays([recent, old], 30, now)).toBe(1);
  });
});
