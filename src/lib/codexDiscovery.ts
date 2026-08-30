import type { Publication, Vault, Tag, PublicationRelation } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RawVaultPublicationRow } from './publicationAggregate';
import type { PublicationTag } from '@/types/database';

export function normalizeTopic(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function topicToSlug(topic: string): string {
  return topic.trim().toLowerCase().replace(/\s+/g, '-');
}

export function slugToTopic(slug: string): string {
  // Slugs collapse spaces to hyphens, so a topic that itself contains a
  // hyphen is not perfectly reversible — an accepted simplification given
  // there's no topic registry to disambiguate against (see design spec,
  // "Topic identity"). Matching re-normalizes anyway, so this only affects
  // the exact page title casing/spacing shown, never which papers match.
  return normalizeTopic(slug.replace(/-+/g, ' '));
}

export interface PublicCodexPublication {
  publication: Publication;
  vault: Vault;
  tags: Tag[];
}

export type TopicMatchSignal =
  | { type: 'tag'; value: string }
  | { type: 'keyword'; value: string }
  | { type: 'notes'; snippet: string }
  | { type: 'citation'; viaPublicationId: string };

export interface TopicMatch {
  publication: Publication;
  vault: Vault;
  signals: TopicMatchSignal[];
}

function directSignalsFor(topic: string, entry: PublicCodexPublication): TopicMatchSignal[] {
  const signals: TopicMatchSignal[] = [];

  entry.tags.forEach((tag) => {
    if (normalizeTopic(tag.name) === topic) signals.push({ type: 'tag', value: tag.name });
  });

  (entry.publication.keywords || []).forEach((keyword) => {
    if (normalizeTopic(keyword) === topic) signals.push({ type: 'keyword', value: keyword });
  });

  const notes = entry.publication.notes;
  if (notes && notes.toLowerCase().includes(topic.toLowerCase())) {
    signals.push({ type: 'notes', snippet: notes });
  }

  return signals;
}

export function matchPublicationsForTopic(
  topic: string,
  corpus: PublicCodexPublication[],
  relations: PublicationRelation[],
): TopicMatch[] {
  const byId = new Map(corpus.map((entry) => [entry.publication.id, entry]));
  const directMatches = new Map<string, TopicMatchSignal[]>();

  corpus.forEach((entry) => {
    const signals = directSignalsFor(topic, entry);
    if (signals.length > 0) directMatches.set(entry.publication.id, signals);
  });

  const results = new Map<string, TopicMatchSignal[]>(directMatches);

  relations.forEach((rel) => {
    const [a, b] = [rel.publication_id, rel.related_publication_id];
    [[a, b], [b, a]].forEach(([sourceId, otherId]) => {
      if (directMatches.has(sourceId) && !directMatches.has(otherId) && byId.has(otherId)) {
        const existing = results.get(otherId) || [];
        if (!existing.some((s) => s.type === 'citation' && s.viaPublicationId === sourceId)) {
          results.set(otherId, [...existing, { type: 'citation', viaPublicationId: sourceId }]);
        }
      }
    });
  });

  return Array.from(results.entries()).map(([id, signals]) => {
    const entry = byId.get(id)!;
    return { publication: entry.publication, vault: entry.vault, signals };
  });
}

export function deriveRelatedTopics(topic: string, matches: TopicMatch[]): string[] {
  const counts = new Map<string, number>();

  matches.forEach((match) => {
    const candidates = new Set<string>();
    match.signals.forEach((signal) => {
      if (signal.type === 'tag' || signal.type === 'keyword') candidates.add(normalizeTopic(signal.value));
    });
    // Also pull in every keyword on the publication, not just the ones that
    // directly signaled this match, so co-occurrence surfaces topics the
    // paper didn't match on but is still tagged/keyworded with.
    (match.publication.keywords || []).forEach((k) => candidates.add(normalizeTopic(k)));

    candidates.forEach((candidate) => {
      if (candidate === topic) return;
      counts.set(candidate, (counts.get(candidate) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

export interface TopicFacets {
  tag?: string;
  author?: string;
  venue?: string;
  year?: number;
}

export function applyTopicFacets(matches: TopicMatch[], facets: TopicFacets): TopicMatch[] {
  return matches.filter((match) => {
    if (facets.year !== undefined && match.publication.year !== facets.year) return false;
    if (facets.author) {
      const needle = facets.author.toLowerCase();
      if (!match.publication.authors.some((a) => a.toLowerCase().includes(needle))) return false;
    }
    if (facets.venue) {
      const journal = match.publication.journal || '';
      if (!journal.toLowerCase().includes(facets.venue.toLowerCase())) return false;
    }
    if (facets.tag) {
      const needle = normalizeTopic(facets.tag);
      const hasTag = match.signals.some((s) => s.type === 'tag' && normalizeTopic(s.value) === needle);
      if (!hasTag) return false;
    }
    return true;
  });
}

export type TopicSortMode = 'relevance' | 'recent' | 'popular' | 'connected';

export interface VaultPopularity {
  favorites: number;
  forks: number;
}

function isDirectMatch(match: TopicMatch): boolean {
  return match.signals.some((s) => s.type !== 'citation');
}

export function sortTopicMatches(
  matches: TopicMatch[],
  mode: TopicSortMode,
  vaultPopularity: Record<string, VaultPopularity>,
  relationCounts: Record<string, number>,
): TopicMatch[] {
  const copy = [...matches];
  switch (mode) {
    case 'recent':
      return copy.sort((a, b) => b.publication.created_at.localeCompare(a.publication.created_at));
    case 'popular':
      return copy.sort((a, b) => {
        const pa = vaultPopularity[a.vault.id] || { favorites: 0, forks: 0 };
        const pb = vaultPopularity[b.vault.id] || { favorites: 0, forks: 0 };
        return (pb.favorites + pb.forks) - (pa.favorites + pa.forks);
      });
    case 'connected':
      return copy.sort((a, b) => (relationCounts[b.publication.id] || 0) - (relationCounts[a.publication.id] || 0));
    case 'relevance':
    default:
      return copy.sort((a, b) => {
        const directDiff = Number(isDirectMatch(b)) - Number(isDirectMatch(a));
        if (directDiff !== 0) return directDiff;
        return b.signals.length - a.signals.length;
      });
  }
}

export function countNewInLastDays(matches: TopicMatch[], days: number, now: Date = new Date()): number {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return matches.filter((m) => new Date(m.publication.created_at).getTime() >= cutoff).length;
}

function throwOnAnyError(results: { error: { message?: string } | null }[]): void {
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

function rawRowToPublication(row: RawVaultPublicationRow): Publication {
  return {
    id: row.id,
    user_id: row.created_by,
    title: row.title,
    authors: row.authors,
    year: row.year,
    journal: row.journal,
    volume: row.volume,
    issue: row.issue,
    pages: row.pages,
    doi: row.doi,
    url: row.url,
    abstract: row.abstract,
    pdf_url: row.pdf_url,
    bibtex_key: row.bibtex_key,
    publication_type: row.publication_type,
    notes: row.notes,
    booktitle: row.booktitle,
    chapter: row.chapter,
    edition: row.edition,
    editor: row.editor ? [row.editor] : null,
    howpublished: row.howpublished,
    institution: row.institution,
    number: row.number,
    organization: row.organization,
    publisher: row.publisher,
    school: row.school,
    series: row.series,
    type: row.type,
    eid: row.eid,
    isbn: row.isbn,
    issn: row.issn,
    keywords: row.keywords,
    reading_state: 'unread',
    important: false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface PublicCodexData {
  corpus: PublicCodexPublication[];
  relations: PublicationRelation[];
}

export async function fetchPublicCodexPublications(supabase: SupabaseClient): Promise<PublicCodexData> {
  const vaultsRes = await supabase.from('vaults').select('*').eq('visibility', 'public');
  throwOnAnyError([vaultsRes]);
  const publicVaults = (vaultsRes.data as Vault[]) || [];
  if (publicVaults.length === 0) return { corpus: [], relations: [] };

  const vaultIds = publicVaults.map((v) => v.id);
  const vaultsById = new Map(publicVaults.map((v) => [v.id, v]));

  const vaultPubsRes = await supabase.from('vault_publications').select('*').in('vault_id', vaultIds);
  throwOnAnyError([vaultPubsRes]);
  const rawRows = (vaultPubsRes.data as RawVaultPublicationRow[]) || [];
  if (rawRows.length === 0) return { corpus: [], relations: [] };

  const pubIds = rawRows.map((r) => r.id);
  const [pubTagsRes, relationsRes] = await Promise.all([
    supabase.from('publication_tags').select('*').in('vault_publication_id', pubIds),
    // Matches the existing anonymous-read pattern in PublicVaultSimple.tsx:
    // relations aren't filtered server-side, filtered against our id set below.
    supabase.from('publication_relations').select('*'),
  ]);
  throwOnAnyError([pubTagsRes, relationsRes]);

  const pubTags = (pubTagsRes.data as PublicationTag[]) || [];
  const tagIds = [...new Set(pubTags.map((pt) => pt.tag_id))];

  let tags: Tag[] = [];
  if (tagIds.length > 0) {
    const tagsRes = await supabase.from('tags').select('*').in('id', tagIds);
    throwOnAnyError([tagsRes]);
    tags = (tagsRes.data as Tag[]) || [];
  }
  const tagsById = new Map(tags.map((t) => [t.id, t]));

  const tagsByPubId = new Map<string, Tag[]>();
  pubTags.forEach((pt) => {
    if (!pt.vault_publication_id) return;
    const tag = tagsById.get(pt.tag_id);
    if (!tag) return;
    const list = tagsByPubId.get(pt.vault_publication_id) || [];
    list.push(tag);
    tagsByPubId.set(pt.vault_publication_id, list);
  });

  const corpus: PublicCodexPublication[] = rawRows.map((row) => ({
    publication: rawRowToPublication(row),
    vault: vaultsById.get(row.vault_id)!,
    tags: tagsByPubId.get(row.id) || [],
  }));

  const pubIdSet = new Set(pubIds);
  const relations = ((relationsRes.data as PublicationRelation[]) || []).filter(
    (rel) => pubIdSet.has(rel.publication_id) || pubIdSet.has(rel.related_publication_id),
  );

  return { corpus, relations };
}
