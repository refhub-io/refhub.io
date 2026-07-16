import { describe, expect, it } from 'vitest';
import { resources } from './resources';

describe('resources config', () => {
  it('has at least one entry, each with a non-empty name, description, and a refhub-io GitHub URL', () => {
    expect(resources.length).toBeGreaterThan(0);
    for (const resource of resources) {
      expect(resource.name.length).toBeGreaterThan(0);
      expect(resource.description.length).toBeGreaterThan(0);
      expect(resource.url).toMatch(/^https:\/\/github\.com\/refhub-io\//);
    }
  });

  it('has no duplicate names or URLs', () => {
    const names = resources.map((r) => r.name);
    const urls = resources.map((r) => r.url);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
