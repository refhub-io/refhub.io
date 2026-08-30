import type { Publication, Vault, Tag, PublicationRelation } from '@/types/database';

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
