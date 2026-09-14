// src/lib/inboxSuggestions.ts
import { scorePair, DUPE_PRESETS } from './dupeDetection';
import type { Publication, Vault } from '@/types/database';

// Reuses the same weighted title/author/year/venue heuristic
// findDuplicateForItem already relies on (via DUPE_PRESETS), instead of the
// separate, much cruder token-overlap scorer this file used to compute on
// its own -- that mismatch between two different similarity functions was
// exactly why a paper could be correctly flagged as a duplicate but still
// get no vault/tag suggestion at all: the two functions disagreed on how
// similar the same pair of papers actually was.
//
// A lower bar than DUPE_PRESETS.loose's own 0.6 threshold on purpose: this
// is a suggestion the user reviews and can freely override, not a duplicate
// verdict, so a false positive here is cheap while a false negative just
// looks like the feature doing nothing.
const SUGGESTION_THRESHOLD = 0.35;

function itemPublicationScore(parsedFields: Partial<Publication>, pub: Publication): number {
  return scorePair(parsedFields, pub, DUPE_PRESETS.loose).score;
}

/** Scores each vault by its best-matching existing publication; returns the
 * top vault if its score clears SUGGESTION_THRESHOLD, else null. */
export function suggestVaultForItem(
  parsedFields: Partial<Publication>,
  publications: Publication[],
  vaults: Vault[],
  publicationVaultsMap: Record<string, string[]>,
): string | null {
  let bestVaultId: string | null = null;
  let bestScore = 0;

  for (const vault of vaults) {
    const vaultPublications = publications.filter((p) => publicationVaultsMap[p.id]?.includes(vault.id));
    for (const pub of vaultPublications) {
      const score = itemPublicationScore(parsedFields, pub);
      if (score > bestScore) {
        bestScore = score;
        bestVaultId = vault.id;
      }
    }
  }

  return bestScore >= SUGGESTION_THRESHOLD ? bestVaultId : null;
}

/** Tags already applied to the most-similar publication in the suggested vault. */
export function suggestTagsForItem(
  parsedFields: Partial<Publication>,
  suggestedVaultId: string | null,
  publications: Publication[],
  publicationVaultsMap: Record<string, string[]>,
  publicationTagsMap: Record<string, string[]>,
): string[] {
  if (!suggestedVaultId) return [];

  const vaultPublications = publications.filter((p) => publicationVaultsMap[p.id]?.includes(suggestedVaultId));
  let bestPub: Publication | null = null;
  let bestScore = 0;
  for (const pub of vaultPublications) {
    const score = itemPublicationScore(parsedFields, pub);
    if (score > bestScore) {
      bestScore = score;
      bestPub = pub;
    }
  }

  if (!bestPub || bestScore < SUGGESTION_THRESHOLD) return [];
  return publicationTagsMap[bestPub.id] ?? [];
}
