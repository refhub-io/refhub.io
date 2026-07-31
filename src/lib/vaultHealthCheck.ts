/**
 * Pure vault health scan: flags publications with missing metadata fields
 * and likely duplicates. No I/O — takes a Publication[] snapshot and
 * returns a flat list of issues.
 */
import { Publication } from '@/types/database';
import { findDuplicateCandidates, DUPE_PRESETS } from '@/lib/dupeDetection';

export type HealthIssueType =
  | 'missing_doi' | 'missing_title' | 'missing_authors' | 'missing_venue'
  | 'missing_year' | 'missing_abstract' | 'missing_url'
  | 'missing_bibtex_key' | 'malformed_bibtex_key' | 'missing_pdf'
  | 'possible_duplicate';

export interface HealthIssue {
  type: HealthIssueType;
  publicationId: string;
  /** only set for 'possible_duplicate' */
  duplicateOfPublicationId?: string;
}

const BIBTEX_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_:.-]*$/;

function scanFieldIssues(pub: Publication): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const flag = (type: HealthIssueType) => issues.push({ type, publicationId: pub.id });

  if (!pub.doi) flag('missing_doi');
  if (!pub.title || !pub.title.trim()) flag('missing_title');
  if (!pub.authors || pub.authors.length === 0) flag('missing_authors');
  if (!pub.journal && !pub.booktitle) flag('missing_venue');
  if (pub.year == null) flag('missing_year');
  if (!pub.abstract || !pub.abstract.trim()) flag('missing_abstract');
  if (!pub.url && !pub.doi) flag('missing_url'); // a DOI already resolves to a URL; only flag when neither exists
  if (!pub.bibtex_key) {
    flag('missing_bibtex_key');
  } else if (!BIBTEX_KEY_PATTERN.test(pub.bibtex_key)) {
    flag('malformed_bibtex_key');
  }
  if (!pub.pdf_url) flag('missing_pdf');

  return issues;
}

/**
 * Scans a snapshot of publications for missing-metadata issues and likely
 * duplicates. Duplicate detection reuses the same `DUPE_PRESETS.balanced`
 * config that `DuplicateCheckDialog` opens with by default (see
 * src/components/publications/DuplicateCheckDialog.tsx:73) — threshold 0.75,
 * applied internally by `findDuplicateCandidates` — so a paper flagged here
 * is exactly what a user would see if they ran the duplicate-check dialog
 * with its default settings.
 */
export function scanVaultHealth(publications: Publication[]): HealthIssue[] {
  const fieldIssues = publications.flatMap(scanFieldIssues);

  const duplicateCandidates = findDuplicateCandidates(publications, DUPE_PRESETS.balanced);

  const duplicateIssues: HealthIssue[] = duplicateCandidates.map(c => ({
    type: 'possible_duplicate' as const,
    publicationId: c.left.id,
    duplicateOfPublicationId: c.right.id,
  }));

  return [...fieldIssues, ...duplicateIssues];
}

export function groupHealthIssuesByType(issues: HealthIssue[]): Record<HealthIssueType, HealthIssue[]> {
  const groups = {} as Record<HealthIssueType, HealthIssue[]>;
  for (const issue of issues) {
    (groups[issue.type] ??= []).push(issue);
  }
  return groups;
}
