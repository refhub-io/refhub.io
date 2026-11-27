import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Publication } from '@/types/database';
import { publicationToBibtex } from './bibtex';

// Shared with refhub-io/.netlify (tests/fixtures/bibtex-golden.json): the web and API exporters
// must produce exactly these citation keys and field values.
const golden = JSON.parse(readFileSync(join(process.cwd(), 'src/lib/bibtex-golden.json'), 'utf8')) as {
  cases: { name: string; publication: Partial<Publication>; expected: Record<string, string> }[];
};

function parseEntry(bibtex: string) {
  const [head, ...rest] = bibtex.split('\n');
  const key = head.match(/^@[^{]+\{([^,]*),$/)?.[1];
  const fields: Record<string, string> = {};
  for (const line of rest) {
    const match = line.match(/^ {2}([a-z]+) = \{(.*)\},?$/);
    if (match) fields[match[1]] = match[2];
  }
  return { key, fields };
}

describe('BibTeX export golden file (shared with the API)', () => {
  for (const testCase of golden.cases) {
    it(testCase.name, () => {
      const publication = { authors: [], title: '', ...testCase.publication } as Publication;
      const { key, fields } = parseEntry(publicationToBibtex(publication));
      const { key: expectedKey, ...expectedFields } = testCase.expected;
      if (expectedKey !== undefined) expect(key).toBe(expectedKey);
      for (const [field, value] of Object.entries(expectedFields)) {
        expect(fields[field]).toBe(value);
      }
    });
  }
});
