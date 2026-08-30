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
