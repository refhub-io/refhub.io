/**
 * Pure vault health scan: flags publications with missing metadata fields
 * and likely duplicates. No I/O — takes a Publication[] snapshot and
 * returns a flat list of issues.
 */
import { Publication } from '@/types/database';
import { findDuplicateCandidates, DUPE_PRESETS } from '@/lib/dupeDetection';
import {
  runSemanticScholarQueue,
  fetchSemanticScholarMetadataByDoi,
  SemanticScholarQueueProgress,
  formatSemanticScholarErrorMessage,
} from '@/lib/semanticScholar';
import { getPublicationSyncDiffs, PublicationSyncDiff } from '@/lib/publicationSync';

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

/** Per-publication field checks — excludes 'possible_duplicate', which is a pairwise/cross-publication signal, not a single field. */
const FIELD_ISSUE_TYPES: HealthIssueType[] = [
  'missing_doi', 'missing_title', 'missing_authors', 'missing_venue',
  'missing_year', 'missing_abstract', 'missing_url',
  'missing_bibtex_key', 'malformed_bibtex_key', 'missing_pdf',
];

/**
 * Field types that gate `completeCount` — a paper's basic citable identity.
 * Deliberately much narrower than `FIELD_ISSUE_TYPES` (used for `scorePercent`):
 * a missing PDF attachment or bibtex key is common and legitimate (most users
 * don't attach a local PDF or hand-set a key), so requiring all ten checks to
 * pass made `completeCount` collapse to ~0 in real vaults even at a healthy
 * overall `scorePercent` — read as contradictory ("75% but 0 complete?").
 * `scorePercent` still weighs all ten fields; only this stricter stat is narrowed.
 */
const CORE_ISSUE_TYPES: HealthIssueType[] = ['missing_title', 'missing_authors', 'missing_year'];

export interface VaultHealthScore {
  /** 0-100: share of tracked fields present across all publications. */
  scorePercent: number;
  /** publications with title, authors, and year present, and not flagged as a likely duplicate. See CORE_ISSUE_TYPES. */
  completeCount: number;
  totalCount: number;
}

export type VaultHealthStatusLevel = 'good' | 'warning' | 'critical';

export interface VaultHealthStatus {
  level: VaultHealthStatusLevel;
  label: string;
}

/**
 * Summarizes `scanVaultHealth`'s output into a single completeness score
 * (percent of field-checks passed across the vault) plus a complete/total
 * paper count. An empty vault scores 100 — there's nothing missing.
 */
export function computeVaultHealthScore(publications: Publication[], issues: HealthIssue[]): VaultHealthScore {
  const totalCount = publications.length;
  if (totalCount === 0) {
    return { scorePercent: 100, completeCount: 0, totalCount: 0 };
  }

  const fieldIssueCount = issues.filter(i => FIELD_ISSUE_TYPES.includes(i.type)).length;
  const totalChecks = totalCount * FIELD_ISSUE_TYPES.length;
  const rawScore = totalChecks === 0 ? 100 : (1 - fieldIssueCount / totalChecks) * 100;
  const scorePercent = Math.max(0, Math.min(100, Math.round(rawScore)));

  const disqualifyingTypes = new Set<HealthIssueType>([...CORE_ISSUE_TYPES, 'possible_duplicate']);
  const flaggedPublicationIds = new Set<string>();
  for (const issue of issues) {
    if (!disqualifyingTypes.has(issue.type)) continue;
    flaggedPublicationIds.add(issue.publicationId);
    if (issue.duplicateOfPublicationId) flaggedPublicationIds.add(issue.duplicateOfPublicationId);
  }
  const completeCount = totalCount - flaggedPublicationIds.size;

  return { scorePercent, completeCount, totalCount };
}

/** Maps a score to a status level/label. Never rely on the level's color alone — pair with this label. */
export function getVaultHealthStatus(scorePercent: number): VaultHealthStatus {
  if (scorePercent >= 80) return { level: 'good', label: 'healthy' };
  if (scorePercent >= 50) return { level: 'warning', label: 'needs attention' };
  return { level: 'critical', label: 'needs work' };
}

export interface VaultHealthEnrichmentResult {
  publication: Publication;
  diffs: PublicationSyncDiff[];
  error?: string;
}

/**
 * Queues Semantic Scholar lookups for DOI-bearing publications and returns
 * the sync diffs (if any) for each. Only publications with a DOI are
 * eligible — this matches the existing single-paper sync flow's own
 * precondition (see src/pages/VaultDetail.tsx:874-882, "Add a DOI before
 * syncing"); there is no title-search fallback in this codebase yet.
 * Individual lookup failures are captured per-item in `error` rather than
 * aborting the whole batch — `runSemanticScholarQueue` already isolates
 * worker failures per item.
 */
export async function runVaultHealthEnrichment(
  publications: Publication[],
  onProgress?: (progress: SemanticScholarQueueProgress) => void,
): Promise<VaultHealthEnrichmentResult[]> {
  const eligible = publications.filter(p => !!p.doi);

  const queueResults = await runSemanticScholarQueue(
    eligible,
    async (pub) => {
      const metadata = await fetchSemanticScholarMetadataByDoi(pub.doi!);
      return metadata ? getPublicationSyncDiffs(pub, metadata) : [];
    },
    { onProgress },
  );

  return queueResults.map((r, i) => ({
    publication: eligible[i],
    diffs: r.ok ? (r.data ?? []) : [],
    error: r.ok ? undefined : formatSemanticScholarErrorMessage(r.error),
  }));
}
