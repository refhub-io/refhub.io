import { describe, expect, it, vi } from 'vitest';
import { normalizeTopic, topicToSlug, slugToTopic, matchPublicationsForTopic, type PublicCodexPublication } from './codexDiscovery';
import type { Publication, Vault, Tag, PublicationRelation } from '@/types/database';

describe('normalizeTopic', () => {
  it('lowercases, trims, and collapses internal whitespace', () => {
    expect(normalizeTopic('  Graph   Drawing  ')).toBe('graph drawing');
  });

  it('treats different-cased/whitespaced variants as the same topic', () => {
    expect(normalizeTopic('Visual Storytelling')).toBe(normalizeTopic('visual   storytelling'));
  });

  it('treats a hyphen as a word separator, same as whitespace', () => {
    expect(normalizeTopic('covid-19')).toBe('covid 19');
    expect(normalizeTopic('Eye-Tracking')).toBe('eye tracking');
    expect(normalizeTopic('multi-touch')).toBe('multi touch');
  });

  it('normalizes a hyphenated source term the same as its space-separated slug form', () => {
    // This is the crux of the bug: a slug is produced from a topic that has
    // already had its hyphens normalized to spaces, so re-deriving a topic
    // from a slug (spaces <- hyphens) must land on the exact same string as
    // normalizing the original hyphenated source text.
    expect(normalizeTopic('covid-19')).toBe(normalizeTopic('covid 19'));
    expect(normalizeTopic('eye-tracking')).toBe(normalizeTopic('eye tracking'));
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

  it('round-trips a hyphenated topic through slug and back', () => {
    const topic = normalizeTopic('covid-19');
    const slug = topicToSlug(topic);
    expect(slugToTopic(slug)).toBe(topic);
  });

  it('URL-encodes characters that would otherwise break the single-segment route', () => {
    const topic = normalizeTopic('HCI/CSCW');
    const slug = topicToSlug(topic);
    expect(slug).not.toContain('/');
    expect(slugToTopic(slug)).toBe(topic);
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
  archived_at: null,
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

  it('matches a tag literally spelled with a hyphen when looked up via its generated slug (end-to-end)', () => {
    // Reproduces the real user flow: a tag/keyword is written with a hyphen,
    // the topic page is reached via /codex/topic/:slug, and the slug is
    // turned back into a topic string before matching runs.
    const pub = makePublication('p1');
    const corpus: PublicCodexPublication[] = [{ publication: pub, vault, tags: [makeTag('t1', 'covid-19')] }];

    const slug = topicToSlug(normalizeTopic('covid-19'));
    const topicFromSlug = slugToTopic(slug);
    const matches = matchPublicationsForTopic(topicFromSlug, corpus, []);

    expect(matches).toHaveLength(1);
    expect(matches[0].signals).toEqual([{ type: 'tag', value: 'covid-19' }]);
  });

  it('matches a keyword literally spelled with a hyphen when looked up via its generated slug (end-to-end)', () => {
    const pub = makePublication('p1', { keywords: ['eye-tracking'] });
    const corpus: PublicCodexPublication[] = [{ publication: pub, vault, tags: [] }];

    const slug = topicToSlug(normalizeTopic('eye-tracking'));
    const topicFromSlug = slugToTopic(slug);
    const matches = matchPublicationsForTopic(topicFromSlug, corpus, []);

    expect(matches).toHaveLength(1);
    expect(matches[0].signals).toEqual([{ type: 'keyword', value: 'eye-tracking' }]);
  });

  it('matches a multi-touch tag when looked up via its generated slug (end-to-end)', () => {
    const pub = makePublication('p1');
    const corpus: PublicCodexPublication[] = [{ publication: pub, vault, tags: [makeTag('t1', 'multi-touch')] }];

    const slug = topicToSlug(normalizeTopic('multi-touch'));
    const topicFromSlug = slugToTopic(slug);
    const matches = matchPublicationsForTopic(topicFromSlug, corpus, []);

    expect(matches).toHaveLength(1);
    expect(matches[0].signals).toEqual([{ type: 'tag', value: 'multi-touch' }]);
  });

  it('populates each match with the publication\'s full tag list, not just tag-signal tags', () => {
    const pub = makePublication('p1', { keywords: ['Graph Drawing'] });
    const tags = [makeTag('t1', 'Network Visualization')];
    const corpus: PublicCodexPublication[] = [{ publication: pub, vault, tags }];
    const matches = matchPublicationsForTopic('graph drawing', corpus, []);
    expect(matches).toHaveLength(1);
    expect(matches[0].tags).toEqual(tags);
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

  it('surfaces a co-occurring tag from match.tags, not just publication.keywords', () => {
    const pub = makePublication('p1');
    const tags = [makeTag('t1', 'graph drawing'), makeTag('t2', 'Network Visualization')];
    const matches: TopicMatch[] = [{ publication: pub, vault: makeVault('v1'), signals: [{ type: 'tag', value: 'graph drawing' }], tags }];
    expect(deriveRelatedTopics('graph drawing', matches)).toEqual(['network visualization']);
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

  it('filters by tag using match.tags, narrowing results a tag-only signal check could never narrow', () => {
    const matchWithTag: TopicMatch = {
      publication: makePublication('p1'),
      vault: makeVault('v1'),
      signals: [{ type: 'keyword', value: 'graph drawing' }],
      tags: [makeTag('t1', 'Network Visualization')],
    };
    const matchWithoutTag: TopicMatch = {
      publication: makePublication('p2'),
      vault: makeVault('v1'),
      signals: [{ type: 'keyword', value: 'graph drawing' }],
      tags: [makeTag('t2', 'Something Else')],
    };
    const result = applyTopicFacets([matchWithTag, matchWithoutTag], { tag: 'network visualization' });
    expect(result.map((m) => m.publication.id)).toEqual(['p1']);
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

import { buildCodexCorpus, fetchCodexTopic } from './codexDiscovery';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RawVaultPublicationRow } from './publicationAggregate';

const rawVaultPub = (id: string, vault_id: string, overrides: Partial<RawVaultPublicationRow> = {}): RawVaultPublicationRow => ({
  id,
  vault_id,
  created_by: 'owner-1',
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
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  original_publication_id: null,
  ...overrides,
});

describe('buildCodexCorpus', () => {
  it('pairs each paper with its vault and the tags on it', () => {
    const corpus = buildCodexCorpus({
      vaults: [makeVault('v1')],
      vault_publications: [rawVaultPub('p1', 'v1'), rawVaultPub('p2', 'v1')],
      publication_tags: [{ vault_publication_id: 'p1', tag_id: 't1' }],
      tags: [makeTag('t1', 'graph drawing')],
      publication_relations: [],
    });
    expect(corpus.map((e) => [e.publication.id, e.vault.id, e.tags.map((t) => t.name)])).toEqual([
      ['p1', 'v1', ['graph drawing']],
      ['p2', 'v1', []],
    ]);
  });

  it("leaves out links to tags the caller can't read, and canonical links", () => {
    const corpus = buildCodexCorpus({
      vaults: [makeVault('v1')],
      vault_publications: [rawVaultPub('p1', 'v1')],
      publication_tags: [
        { vault_publication_id: 'p1', tag_id: 'unreadable' },
        { vault_publication_id: null, tag_id: 't1' },
      ],
      tags: [makeTag('t1', 'graph drawing')],
      publication_relations: [],
    });
    expect(corpus[0].tags).toEqual([]);
  });
});

describe('fetchCodexTopic', () => {
  const rows = {
    vaults: [makeVault('v1')],
    vault_publications: [rawVaultPub('p1', 'v1', { keywords: ['Graph Drawing'] }), rawVaultPub('p2', 'v1')],
    publication_tags: [],
    tags: [],
    publication_relations: [{ id: 'r1', publication_id: 'p1', related_publication_id: 'p2', relation_type: 'cites', created_at: '', created_by: 'owner-1' }] as PublicationRelation[],
    popularity: [{ vault_id: 'v1', favorites: 3, forks: 1 }],
    owners: [{ user_id: 'owner-1', display_name: 'Owner One', username: 'owner1' }],
  };

  it('asks get_codex_topic for the topic, and returns what matching needs', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const result = await fetchCodexTopic({ rpc } as unknown as SupabaseClient, 'graph drawing');

    expect(rpc).toHaveBeenCalledWith('get_codex_topic', { p_topic: 'graph drawing' });
    expect(result.popularity).toEqual({ v1: { favorites: 3, forks: 1 } });
    expect(result.ownersById).toEqual({ 'owner-1': { display_name: 'Owner One', username: 'owner1' } });
    const matches = matchPublicationsForTopic('graph drawing', result.corpus, result.relations);
    expect(matches.map((m) => [m.publication.id, m.signals.map((s) => s.type)])).toEqual([
      ['p1', ['keyword']],
      ['p2', ['citation']],
    ]);
  });

  it('throws the error when the call fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(fetchCodexTopic({ rpc } as unknown as SupabaseClient, 'graph drawing')).rejects.toEqual({ message: 'boom' });
  });
});
