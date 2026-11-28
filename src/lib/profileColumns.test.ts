import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_PROFILE_COLUMNS } from './profile';

// The database grants clients only some profile columns (no email), so a query asking for
// another column, or for *, fails at runtime with a 403. Mocked unit tests can't catch that.

const MIGRATION = 'supabase/migrations/20261128000000_hide_profile_emails.sql';
const columnsOf = (list: string) => list.split(',').map((c) => c.trim()).filter(Boolean).sort();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe('profile columns', () => {
  it('match the columns the database grants clients, without email', () => {
    const grant = readFileSync(join(process.cwd(), MIGRATION), 'utf8').match(/GRANT SELECT \(([^)]*)\)\s+ON public\.profiles/);
    expect(grant).not.toBeNull();
    expect(columnsOf(PUBLIC_PROFILE_COLUMNS)).toEqual(columnsOf(grant![1]));
    expect(columnsOf(PUBLIC_PROFILE_COLUMNS)).not.toContain('email');
  });

  it('are the only ones client queries read from profiles', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from\(['"]profiles['"]\)[^;]*?\.select\(([^)]*)\)/g)) {
        const arg = match[1].trim();
        const literal = arg.match(/^['"`](.*)['"`]$/s)?.[1];
        if (arg === '' || (literal !== undefined && (literal.includes('*') || !columnsOf(literal).every((c) => columnsOf(PUBLIC_PROFILE_COLUMNS).includes(c))))) {
          offenders.push(`${file.replace(process.cwd() + '/', '')}: select(${arg})`);
        }
      }
      for (const match of source.matchAll(/profiles!?[\w]*\(([^)]*)\)/g)) {
        if (/\*|email/.test(match[1])) offenders.push(`${file.replace(process.cwd() + '/', '')}: embedded profiles(${match[1]})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
