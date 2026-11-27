import type { Publication } from '@/types/database';
import type { SSPaper } from '@/lib/semanticScholar';
import { findDuplicate } from '@/lib/dupeDetection';

/**
 * Finds the vault publication matching `paper`, if any, by the same rule as manual add, import
 * and the inbox (lib/dupeDetection findDuplicate): same DOI, or a strict title/author/year match.
 * Returns the matched Publication (not just a boolean) so callers that need to build a reference
 * to it don't have to re-scan.
 */
export function findMatchingPublication(paper: SSPaper, vaultPublications: Publication[]): Publication | null {
  const candidate = {
    title: paper.title,
    authors: paper.authors?.map((author) => author.name) ?? [],
    year: paper.year,
    doi: paper.externalIds?.DOI ?? null,
  };
  return findDuplicate(candidate, vaultPublications)?.publication ?? null;
}

export function isAlreadyInVault(paper: SSPaper, vaultPublications: Publication[]): boolean {
  return findMatchingPublication(paper, vaultPublications) !== null;
}
