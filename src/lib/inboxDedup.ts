// src/lib/inboxDedup.ts
import { scorePair, DUPE_PRESETS } from './dupeDetection';
import type { Publication } from '@/types/database';

/**
 * Scores an inbox item's parsed metadata against the user's existing
 * publications using the same strict preset AddImportDialog.tsx's own
 * checkForDuplicate already uses, so an inbox-captured duplicate and a
 * manually-imported duplicate get judged the same way.
 */
export function findDuplicateForItem(
  parsedFields: Partial<Publication>,
  existingPublications: Publication[],
): Publication | null {
  const preset = DUPE_PRESETS.strict;
  return existingPublications.find(
    (pub) => scorePair(parsedFields, pub, preset).score >= preset.threshold,
  ) ?? null;
}
