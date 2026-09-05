import type { Publication } from '@/types/database';
import type { SSPaper } from '@/lib/semanticScholar';

/**
 * Finds the vault publication matching `paper`, if any — DOI first
 * (case-insensitive), title as a fallback for vault entries with no DOI.
 * Returns the matched Publication (not just a boolean) so callers that
 * need to build a reference to it — not just confirm one exists — don't
 * have to re-scan.
 */
export function findMatchingPublication(paper: SSPaper, vaultPublications: Publication[]): Publication | null {
  const doi = paper.externalIds?.DOI?.toLowerCase();
  if (doi) {
    const byDoi = vaultPublications.find((p) => p.doi?.toLowerCase() === doi);
    if (byDoi) return byDoi;
  }
  const titleLower = paper.title.toLowerCase().trim();
  return vaultPublications.find((p) => p.title.toLowerCase().trim() === titleLower) ?? null;
}

export function isAlreadyInVault(paper: SSPaper, vaultPublications: Publication[]): boolean {
  return findMatchingPublication(paper, vaultPublications) !== null;
}
