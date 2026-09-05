import type { Publication, PublicationRelation } from '@/types/database';
import { runSemanticScholarQueue, type SemanticScholarQueueProgress } from '@/lib/semanticScholar';
import { findRelationshipSuggestions, type RelationshipSuggestion } from '@/lib/relationshipSuggestions';

const CACHE_KEY = 'refhub_relationship_scan_cache_v1';
const DEFAULT_SKIP_MS = 24 * 60 * 60 * 1000; // 24 hours — same default as vaultHealthCheck's runVaultHealthEnrichment

function readCache(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeCacheEntries(dois: string[]): void {
  if (dois.length === 0) return;
  try {
    const cache = readCache();
    const now = Date.now();
    for (const doi of dois) cache[doi] = now;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best-effort: if localStorage is full or unavailable, skip caching
  }
}

function getRecentlyCheckedDois(ttlMs: number): Set<string> {
  const cache = readCache();
  const cutoff = Date.now() - ttlMs;
  const recent = new Set<string>();
  for (const [doi, ts] of Object.entries(cache)) {
    if (ts >= cutoff) recent.add(doi);
  }
  return recent;
}

export interface VaultRelationshipScanResult {
  suggestions: RelationshipSuggestion[];
  /** publications with a DOI that were skipped because they were checked within skipRecentMs. */
  skippedCount: number;
}

/**
 * Scans DOI-bearing publications for relationship suggestions against the
 * rest of the vault, resumably. Only publications with a DOI are eligible —
 * matches the single-paper entry points' precondition (no DOI, no citation
 * data to check). Only successful checks get cached; a rate-limited or
 * failed paper stays eligible and is retried first on the next run.
 */
export async function runVaultRelationshipScan(
  publications: Publication[],
  existingRelations: PublicationRelation[],
  onProgress?: (progress: SemanticScholarQueueProgress) => void,
  options?: { skipRecentMs?: number },
): Promise<VaultRelationshipScanResult> {
  const skipRecentMs = options?.skipRecentMs ?? DEFAULT_SKIP_MS;
  const eligible = publications.filter((p) => !!p.doi);

  let toCheck = eligible;
  let skippedCount = 0;

  if (skipRecentMs > 0 && eligible.length > 0) {
    const recent = getRecentlyCheckedDois(skipRecentMs);
    toCheck = eligible.filter((p) => !recent.has(p.doi!));
    skippedCount = eligible.length - toCheck.length;
  }

  if (toCheck.length === 0) {
    return { suggestions: [], skippedCount };
  }

  const queueResults = await runSemanticScholarQueue(
    toCheck,
    (pub) => findRelationshipSuggestions({ id: pub.id, doi: pub.doi, title: pub.title }, publications, existingRelations),
    { onProgress },
  );

  const successfulDois: string[] = [];
  const allSuggestions: RelationshipSuggestion[] = [];
  const seenPairs = new Set<string>();

  queueResults.forEach((result, i) => {
    if (!result.ok) return;
    successfulDois.push(toCheck[i].doi!);
    for (const suggestion of result.data ?? []) {
      const pairKey = [suggestion.sourcePublicationId, suggestion.targetPublicationId].sort().join(':');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      allSuggestions.push(suggestion);
    }
  });

  // Only cache successful lookups — rate-limited or failed papers should be
  // retried on the next run rather than silently skipped.
  writeCacheEntries(successfulDois);

  return { suggestions: allSuggestions, skippedCount };
}
