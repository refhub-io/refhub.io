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
  | 'missing_year' | 'missing_publication_type'
  | 'missing_volume' | 'missing_issue' | 'missing_pages' | 'missing_editor'
  | 'missing_publisher' | 'missing_edition' | 'missing_series' | 'missing_isbn'
  | 'missing_pdf' | 'missing_url' | 'missing_keywords' | 'missing_abstract'
  | 'missing_bibtex_key' | 'malformed_bibtex_key'
  | 'possible_duplicate';

export interface HealthIssue {
  type: HealthIssueType;
  publicationId: string;
  /** only set for 'possible_duplicate' */
  duplicateOfPublicationId?: string;
}

const BIBTEX_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_:.-]*$/;

/**
 * A single per-publication field check. `tier` drives both scoring weight
 * (see TIER_WEIGHT) and completeness (tier 1 is the absolute minimum for a
 * paper to count as "complete" — see REQUIRED_ISSUE_TYPES). `appliesTo` lets
 * tier-2 checks be conditional on `publication_type` — an isbn is meaningless
 * for a journal article, a volume/issue is meaningless for a book — mirroring
 * the same type-dependent field visibility already used in the manual entry
 * form (see AddImportDialog.tsx's "Publication type-dependent fields").
 */
interface FieldCheckDef {
  type: HealthIssueType;
  tier: 1 | 2 | 3;
  appliesTo: (pub: Publication) => boolean;
  isMissing: (pub: Publication) => boolean;
}

const ALWAYS_APPLIES = () => true;

const FIELD_CHECK_DEFS: FieldCheckDef[] = [
  // Tier 1 — absolute minimum for a paper to be considered "complete" and citable.
  { type: 'missing_title', tier: 1, appliesTo: ALWAYS_APPLIES, isMissing: (p) => !p.title || !p.title.trim() },
  { type: 'missing_authors', tier: 1, appliesTo: ALWAYS_APPLIES, isMissing: (p) => !p.authors || p.authors.length === 0 },
  { type: 'missing_year', tier: 1, appliesTo: ALWAYS_APPLIES, isMissing: (p) => p.year == null },
  { type: 'missing_doi', tier: 1, appliesTo: ALWAYS_APPLIES, isMissing: (p) => !p.doi },
  { type: 'missing_venue', tier: 1, appliesTo: ALWAYS_APPLIES, isMissing: (p) => !p.journal && !p.booktitle },
  { type: 'missing_publication_type', tier: 1, appliesTo: ALWAYS_APPLIES, isMissing: (p) => !p.publication_type || !p.publication_type.trim() },

  // Tier 2 — secondary importance, only checked for manuscript types where the field is meaningful.
  { type: 'missing_volume', tier: 2, appliesTo: (p) => p.publication_type === 'article', isMissing: (p) => !p.volume },
  { type: 'missing_issue', tier: 2, appliesTo: (p) => p.publication_type === 'article', isMissing: (p) => !p.issue },
  { type: 'missing_pages', tier: 2, appliesTo: (p) => ['article', 'inproceedings', 'conference', 'incollection', 'inbook'].includes(p.publication_type), isMissing: (p) => !p.pages },
  { type: 'missing_editor', tier: 2, appliesTo: (p) => ['book', 'inbook', 'incollection', 'proceedings'].includes(p.publication_type), isMissing: (p) => !p.editor || p.editor.length === 0 },
  { type: 'missing_publisher', tier: 2, appliesTo: (p) => ['book', 'booklet', 'inbook', 'incollection', 'proceedings', 'manual'].includes(p.publication_type), isMissing: (p) => !p.publisher },
  { type: 'missing_edition', tier: 2, appliesTo: (p) => ['book', 'inbook', 'manual'].includes(p.publication_type), isMissing: (p) => !p.edition },
  { type: 'missing_series', tier: 2, appliesTo: (p) => ['book', 'inbook', 'incollection', 'proceedings'].includes(p.publication_type), isMissing: (p) => !p.series },
  { type: 'missing_isbn', tier: 2, appliesTo: (p) => ['book', 'inbook', 'incollection', 'proceedings', 'manual'].includes(p.publication_type), isMissing: (p) => !p.isbn },

  // Tier 3 — tertiary / supplementary, never disqualifying.
  { type: 'missing_pdf', tier: 3, appliesTo: ALWAYS_APPLIES, isMissing: (p) => !p.pdf_url },
  { type: 'missing_url', tier: 3, appliesTo: ALWAYS_APPLIES, isMissing: (p) => !p.url && !p.doi }, // a DOI already resolves to a URL; only flag when neither exists
  { type: 'missing_keywords', tier: 3, appliesTo: ALWAYS_APPLIES, isMissing: (p) => !p.keywords || p.keywords.length === 0 },
  { type: 'missing_abstract', tier: 3, appliesTo: ALWAYS_APPLIES, isMissing: (p) => !p.abstract || !p.abstract.trim() },
  { type: 'missing_bibtex_key', tier: 3, appliesTo: ALWAYS_APPLIES, isMissing: (p) => !p.bibtex_key },
  { type: 'malformed_bibtex_key', tier: 3, appliesTo: (p) => !!p.bibtex_key, isMissing: (p) => !BIBTEX_KEY_PATTERN.test(p.bibtex_key!) },
];

function scanFieldIssues(pub: Publication): HealthIssue[] {
  return FIELD_CHECK_DEFS
    .filter((def) => def.appliesTo(pub) && def.isMissing(pub))
    .map((def) => ({ type: def.type, publicationId: pub.id }));
}

/** 1 = required, 2 = secondary, 3 = tertiary. Lets UI group/label issue sections by importance. */
export const ISSUE_TYPE_TIER: Partial<Record<HealthIssueType, 1 | 2 | 3>> = Object.fromEntries(
  FIELD_CHECK_DEFS.map((def) => [def.type, def.tier]),
);

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

/**
 * Score weight per tier — tier 1 (absolute requirements) counts 3x as much
 * as tier 3 (tertiary/supplementary) per missing/present field-check, so a
 * vault full of papers missing DOIs or venues reads as much less healthy
 * than one that's merely missing PDFs or keywords.
 */
const TIER_WEIGHT: Record<1 | 2 | 3, number> = { 1: 3, 2: 2, 3: 1 };

/**
 * Field types that gate `completeCount` — the absolute minimum for a paper
 * to count as "complete": title, authors, year, doi, venue, and publication
 * type all present. Anything else (volume/pages/publisher/pdf/keywords/etc.)
 * still affects `scorePercent` but does not by itself disqualify a paper
 * from being counted complete.
 */
const REQUIRED_ISSUE_TYPES: HealthIssueType[] = FIELD_CHECK_DEFS
  .filter((def) => def.tier === 1)
  .map((def) => def.type);

export interface VaultHealthScore {
  /** 0-100: tier-weighted share of applicable fields present across all publications. */
  scorePercent: number;
  /** publications with every tier-1 field present, and not flagged as a likely duplicate. See REQUIRED_ISSUE_TYPES. */
  completeCount: number;
  totalCount: number;
}

export type VaultHealthStatusLevel = 'good' | 'warning' | 'critical';

export interface VaultHealthStatus {
  level: VaultHealthStatusLevel;
  label: string;
}

/**
 * Summarizes vault completeness into a single tier-weighted score (see
 * TIER_WEIGHT) plus a complete/total paper count gated on the tier-1
 * required fields (see REQUIRED_ISSUE_TYPES). Only fields whose `appliesTo`
 * matches a given publication's `publication_type` count toward that
 * publication's denominator, so e.g. an "article" is never penalized for
 * lacking an isbn. An empty vault scores 100 — there's nothing missing.
 */
export function computeVaultHealthScore(publications: Publication[], issues: HealthIssue[]): VaultHealthScore {
  const totalCount = publications.length;
  if (totalCount === 0) {
    return { scorePercent: 100, completeCount: 0, totalCount: 0 };
  }

  let earnedWeight = 0;
  let applicableWeight = 0;
  for (const pub of publications) {
    for (const def of FIELD_CHECK_DEFS) {
      if (!def.appliesTo(pub)) continue;
      const weight = TIER_WEIGHT[def.tier];
      applicableWeight += weight;
      if (!def.isMissing(pub)) earnedWeight += weight;
    }
  }
  const rawScore = applicableWeight === 0 ? 100 : (earnedWeight / applicableWeight) * 100;
  const scorePercent = Math.max(0, Math.min(100, Math.round(rawScore)));

  const disqualifyingTypes = new Set<HealthIssueType>([...REQUIRED_ISSUE_TYPES, 'possible_duplicate']);
  const flaggedPublicationIds = new Set<string>();
  for (const issue of issues) {
    if (!disqualifyingTypes.has(issue.type)) continue;
    flaggedPublicationIds.add(issue.publicationId);
    if (issue.duplicateOfPublicationId) flaggedPublicationIds.add(issue.duplicateOfPublicationId);
  }
  const completeCount = totalCount - flaggedPublicationIds.size;

  return { scorePercent, completeCount, totalCount };
}

export interface VaultHealthUserStats {
  /** null when no tag data was supplied — distinct from "0 missing" (see computeVaultHealthUserStats). */
  missingTagsCount: number | null;
  missingNotesCount: number;
  /** null when no drive-attachment data was supplied — distinct from "0 missing". */
  missingDriveUrlCount: number | null;
  unreadCount: number;
  totalCount: number;
}

/**
 * Counts for the tier-4 "user-defined" fields (tags, notes, drive-attached
 * PDF, reading state) — organizational metadata the user adds themselves,
 * not bibliographic completeness. Deliberately excluded from `scorePercent`
 * (per the user's own framing: these say more about how *they've* organized
 * a vault than how complete a citation is) and surfaced as separate counts
 * instead. `hasTag`/`hasDriveUrl` are optional because that data lives in
 * separate tables (publication_tags, publication_pdf_assets) not present on
 * a bare Publication snapshot — omit them and the corresponding count comes
 * back `null` rather than a misleading "all missing".
 */
export function computeVaultHealthUserStats(
  publications: Publication[],
  options?: { hasTag?: (publicationId: string) => boolean; hasDriveUrl?: (publicationId: string) => boolean },
): VaultHealthUserStats {
  const totalCount = publications.length;
  let missingTagsCount = options?.hasTag ? 0 : null;
  let missingNotesCount = 0;
  let missingDriveUrlCount = options?.hasDriveUrl ? 0 : null;
  let unreadCount = 0;

  for (const pub of publications) {
    if (options?.hasTag && !options.hasTag(pub.id)) missingTagsCount = (missingTagsCount ?? 0) + 1;
    if (!pub.notes || !pub.notes.trim()) missingNotesCount += 1;
    if (options?.hasDriveUrl && !options.hasDriveUrl(pub.id)) missingDriveUrlCount = (missingDriveUrlCount ?? 0) + 1;
    if (pub.reading_state === 'unread') unreadCount += 1;
  }

  return { missingTagsCount, missingNotesCount, missingDriveUrlCount, unreadCount, totalCount };
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
