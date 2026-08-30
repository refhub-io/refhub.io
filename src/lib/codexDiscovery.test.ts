import { describe, expect, it } from 'vitest';
import { normalizeTopic, topicToSlug, slugToTopic } from './codexDiscovery';

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
