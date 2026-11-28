// src/lib/inboxDedup.ts
import { findDuplicate } from './dupeDetection';
import type { Publication } from '@/types/database';

/**
 * The existing publication an inbox item duplicates, by the same rule as manual add and import
 * (lib/dupeDetection findDuplicate): same DOI, or a strict title/author/year match.
 */
export function findDuplicateForItem(
  parsedFields: Partial<Publication>,
  existingPublications: Publication[],
): Publication | null {
  return findDuplicate(parsedFields, existingPublications)?.publication ?? null;
}
