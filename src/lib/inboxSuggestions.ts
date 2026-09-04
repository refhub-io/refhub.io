// src/lib/inboxSuggestions.ts
import { normalizeBiblioString, lastNameJaccard } from './dupeDetection';
import type { Publication, Vault } from '@/types/database';

const MIN_VAULT_SCORE = 0.25;

function titleTokenOverlap(a: string, b: string): number {
  const tokensA = new Set(normalizeBiblioString(a).split(' ').filter(Boolean));
  const tokensB = new Set(normalizeBiblioString(b).split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  tokensA.forEach((t) => { if (tokensB.has(t)) shared += 1; });
  return shared / Math.max(tokensA.size, tokensB.size);
}

function itemPublicationScore(parsedFields: Partial<Publication>, pub: Publication): number {
  const authorScore = lastNameJaccard(parsedFields.authors, pub.authors);
  const titleScore = titleTokenOverlap(parsedFields.title || '', pub.title || '');
  return authorScore * 0.5 + titleScore * 0.5;
}

/** Scores each vault by its best-matching existing publication; returns the
 * top vault if its score clears MIN_VAULT_SCORE, else null. */
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

  return bestScore >= MIN_VAULT_SCORE ? bestVaultId : null;
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

  if (!bestPub) return [];
  return publicationTagsMap[bestPub.id] ?? [];
}
