import type { Publication, Vault, Tag, PublicationRelation } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RawVaultPublicationRow } from './publicationAggregate';
import type { PublicationTag } from '@/types/database';

export function normalizeTopic(raw: string): string {
  // Hyphens are treated as word separators, same as whitespace, so a tag or
  // keyword literally spelled with a hyphen (e.g. "covid-19", "eye-tracking")
  // normalizes identically to the same phrase reached via a slug (where a
  // space becomes a hyphen). Without this, matching would silently miss
  // hyphenated terms whenever the topic arrived from a URL slug.
  return raw.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

export function topicToSlug(topic: string): string {
  // encodeURIComponent keeps the slug safe as a single `/codex/topic/:topicSlug`
  // path segment even when the topic contains characters like `/`, `#`, `?`,
  // or `%` (e.g. a keyword such as "HCI/CSCW"). React Router's useParams
  // decodes this again before slugToTopic sees it.
  return encodeURIComponent(topic.trim().toLowerCase().replace(/\s+/g, '-'));
}

export function slugToTopic(slug: string): string {
  // React Router's useParams already URL-decodes most percent-escapes, but a
  // slug can also reach here directly (e.g. from a hand-typed URL or a stray
  // double-encode), so decode defensively here too. normalizeTopic treats
  // hyphens as separators, so the space-to-hyphen conversion performed by
  // topicToSlug is undone as part of normalization — this reliably
  // reconstructs the same normalized topic string that was slugified, so it
  // affects neither display nor which papers match (both sides of every
  // comparison go through normalizeTopic).
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug;
  }
  return normalizeTopic(decoded);
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
  /** The publication's full tag list (not just the ones that produced a
   * `tag` signal) — optional because many existing tests construct
   * TopicMatch literals without it; treat a missing value as `[]`. */
  tags?: Tag[];
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
    return { publication: entry.publication, vault: entry.vault, tags: entry.tags, signals };
  });
}

export function deriveRelatedTopics(topic: string, matches: TopicMatch[]): string[] {
  const counts = new Map<string, number>();

  matches.forEach((match) => {
    const candidates = new Set<string>();
    match.signals.forEach((signal) => {
      if (signal.type === 'tag' || signal.type === 'keyword') candidates.add(normalizeTopic(signal.value));
    });
    // Also pull in every keyword and tag on the publication, not just the
    // ones that directly signaled this match, so co-occurrence surfaces
    // topics the paper didn't match on but is still tagged/keyworded with.
    (match.publication.keywords || []).forEach((k) => candidates.add(normalizeTopic(k)));
    (match.tags || []).forEach((t) => candidates.add(normalizeTopic(t.name)));

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
      const hasTag = (match.tags || []).some((t) => normalizeTopic(t.name) === needle);
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
    editor: row.editor,
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

/** A slice of the public corpus, as get_codex_topic() returns it. */
export interface CodexCorpusRows {
  vaults: Vault[];
  vault_publications: RawVaultPublicationRow[];
  publication_tags: Pick<PublicationTag, 'vault_publication_id' | 'tag_id'>[];
  tags: Tag[];
  publication_relations: PublicationRelation[];
}

/** Each paper with its vault and the tags the caller can read on it. */
export function buildCodexCorpus(rows: CodexCorpusRows): PublicCodexPublication[] {
  const vaultsById = new Map(rows.vaults.map((v) => [v.id, v]));
  const tagsById = new Map(rows.tags.map((t) => [t.id, t]));
  const tagsByPubId = new Map<string, Tag[]>();
  rows.publication_tags.forEach((pt) => {
    if (!pt.vault_publication_id) return;
    const tag = tagsById.get(pt.tag_id);
    if (!tag) return;
    const list = tagsByPubId.get(pt.vault_publication_id) || [];
    list.push(tag);
    tagsByPubId.set(pt.vault_publication_id, list);
  });

  return rows.vault_publications
    .filter((row) => vaultsById.has(row.vault_id))
    .map((row) => ({
      publication: rawRowToPublication(row),
      vault: vaultsById.get(row.vault_id)!,
      tags: tagsByPubId.get(row.id) || [],
    }));
}

export interface CodexTopicData {
  /** The public papers that mention the topic, and the public papers related to them. */
  corpus: PublicCodexPublication[];
  relations: PublicationRelation[];
  /** Favorites and forks for each of those papers' vaults. */
  popularity: Record<string, VaultPopularity>;
  /** Those vaults' owners, where the caller can read their profile. */
  ownersById: Record<string, { display_name: string | null; username: string | null }>;
}

interface CodexTopicRows extends CodexCorpusRows {
  popularity: { vault_id: string; favorites: number; forks: number }[];
  owners: { user_id: string; display_name: string | null; username: string | null }[];
}

/**
 * What a topic's page needs, in one call (#275): instead of the whole public corpus, only the
 * papers whose keywords, tags or notes mention the topic and the papers related to them. Pass the
 * result to matchPublicationsForTopic(), which decides the matches as before.
 */
export async function fetchCodexTopic(supabase: SupabaseClient, topic: string): Promise<CodexTopicData> {
  const { data, error } = await supabase.rpc('get_codex_topic', { p_topic: topic });
  if (error) throw error;
  const rows = data as unknown as CodexTopicRows;
  return {
    corpus: buildCodexCorpus(rows),
    relations: rows.publication_relations,
    popularity: Object.fromEntries(rows.popularity.map((p) => [p.vault_id, { favorites: p.favorites, forks: p.forks }])),
    ownersById: Object.fromEntries(rows.owners.map((o) => [o.user_id, { display_name: o.display_name, username: o.username }])),
  };
}
