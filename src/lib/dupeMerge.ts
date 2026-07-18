/**
 * Git-like merge of two duplicate publications: pure conflict listing +
 * plan building, and a Supabase executor that applies the plan.
 * See docs/superpowers/specs/2026-07-17-dupe-check-and-latex-notes-design.md.
 */
import { supabase } from '@/integrations/supabase/client';
import { BIBLIOGRAPHIC_FIELDS, type BibliographicField } from '@/lib/publicationSync';
import type { Publication } from '@/types/database';

export type Side = 'left' | 'right';

export interface VaultCopyRef {
  id: string;
  vault_id: string;
  original_publication_id: string | null;
}

const comparable = (v: unknown): string => (Array.isArray(v) ? v.join('|') : v == null ? '' : String(v));
const isEmpty = (v: unknown): boolean =>
  v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

export interface FieldConflict {
  field: BibliographicField;
  left: unknown;
  right: unknown;
}

/** fields where both sides have a value and they differ; one-sided values auto-fill and never conflict */
export function listFieldConflicts(left: Publication, right: Publication): FieldConflict[] {
  const out: FieldConflict[] = [];
  for (const field of BIBLIOGRAPHIC_FIELDS) {
    const l = left[field];
    const r = right[field];
    if (isEmpty(l) || isEmpty(r)) continue;
    if (comparable(l) !== comparable(r)) out.push({ field, left: l, right: r });
  }
  return out;
}

export interface VaultConflict {
  vault_id: string;
  leftCopy: VaultCopyRef;
  rightCopy: VaultCopyRef;
}

/** vaults that contain a copy of BOTH papers — the user must pick whose annotations survive */
export function listVaultConflicts(leftId: string, rightId: string, links: VaultCopyRef[]): VaultConflict[] {
  const byVault = new Map<string, { left?: VaultCopyRef; right?: VaultCopyRef }>();
  for (const link of links) {
    if (link.original_publication_id !== leftId && link.original_publication_id !== rightId) continue;
    const entry = byVault.get(link.vault_id) ?? {};
    if (link.original_publication_id === leftId) entry.left = link;
    else entry.right = link;
    byVault.set(link.vault_id, entry);
  }
  const out: VaultConflict[] = [];
  for (const [vault_id, entry] of byVault) {
    if (entry.left && entry.right) out.push({ vault_id, leftCopy: entry.left, rightCopy: entry.right });
  }
  return out;
}

export interface MergeDecisions {
  survivor: Side;
  fieldChoices: Partial<Record<BibliographicField, Side>>;
  /** keyed by vault_id for conflicted vaults; missing entries default to the survivor side */
  vaultChoices: Record<string, Side>;
}

export interface MergePlan {
  survivorId: string;
  loserId: string;
  survivorPatch: Partial<Publication>;
  repointCopyIds: string[];
  deleteCopyIds: string[];
}

export function buildMergePlan(
  left: Publication,
  right: Publication,
  links: VaultCopyRef[],
  decisions: MergeDecisions,
): MergePlan {
  const survivor = decisions.survivor === 'left' ? left : right;
  const loser = decisions.survivor === 'left' ? right : left;

  const survivorPatch: Partial<Publication> = {};
  for (const field of BIBLIOGRAPHIC_FIELDS) {
    const l = left[field];
    const r = right[field];
    let value: unknown;
    if (isEmpty(l)) value = r;
    else if (isEmpty(r)) value = l;
    else if (comparable(l) === comparable(r)) value = l;
    else value = (decisions.fieldChoices[field] ?? decisions.survivor) === 'left' ? l : r;
    if (comparable(value) !== comparable(survivor[field])) {
      (survivorPatch as Record<string, unknown>)[field] = value;
    }
  }

  const conflicts = listVaultConflicts(left.id, right.id, links);
  const conflictedVaultIds = new Set(conflicts.map((c) => c.vault_id));

  const repointCopyIds: string[] = [];
  const deleteCopyIds: string[] = [];
  for (const conflict of conflicts) {
    const keep = decisions.vaultChoices[conflict.vault_id] ?? decisions.survivor;
    const keptCopy = keep === 'left' ? conflict.leftCopy : conflict.rightCopy;
    const droppedCopy = keep === 'left' ? conflict.rightCopy : conflict.leftCopy;
    deleteCopyIds.push(droppedCopy.id);
    if (keptCopy.original_publication_id === loser.id) repointCopyIds.push(keptCopy.id);
  }
  for (const link of links) {
    if (link.original_publication_id !== loser.id) continue;
    if (conflictedVaultIds.has(link.vault_id)) continue;
    repointCopyIds.push(link.id);
  }

  return { survivorId: survivor.id, loserId: loser.id, survivorPatch, repointCopyIds, deleteCopyIds };
}

/**
 * Applies a merge plan. Steps run in dependency order; the first failure
 * throws with a step description and aborts the remaining steps.
 */
export async function executeMergePlan(plan: MergePlan): Promise<void> {
  if (Object.keys(plan.survivorPatch).length > 0) {
    const { error } = await supabase.from('publications').update(plan.survivorPatch).eq('id', plan.survivorId);
    if (error) throw new Error(`updating merged fields: ${error.message}`);
  }

  if (plan.deleteCopyIds.length > 0) {
    const { error: tagError } = await supabase
      .from('publication_tags')
      .delete()
      .in('vault_publication_id', plan.deleteCopyIds);
    if (tagError) throw new Error(`removing tags of dropped copies: ${tagError.message}`);
    const { error } = await supabase.from('vault_publications').delete().in('id', plan.deleteCopyIds);
    if (error) throw new Error(`removing dropped vault copies: ${error.message}`);
  }

  if (plan.repointCopyIds.length > 0) {
    const { error } = await supabase
      .from('vault_publications')
      .update({ original_publication_id: plan.survivorId })
      .in('id', plan.repointCopyIds);
    if (error) throw new Error(`re-pointing vault copies: ${error.message}`);
  }

  // move the loser's tags unless the survivor already carries the same tag
  const { data: loserTags, error: loserTagError } = await supabase
    .from('publication_tags')
    .select('id, tag_id')
    .eq('publication_id', plan.loserId);
  if (loserTagError) throw new Error(`reading tags: ${loserTagError.message}`);
  if (loserTags && loserTags.length > 0) {
    const { data: survivorTags, error: survivorTagError } = await supabase
      .from('publication_tags')
      .select('tag_id')
      .eq('publication_id', plan.survivorId);
    if (survivorTagError) throw new Error(`reading tags: ${survivorTagError.message}`);
    const existing = new Set((survivorTags ?? []).map((t) => t.tag_id));
    const toMove = loserTags.filter((t) => !existing.has(t.tag_id)).map((t) => t.id);
    const toDrop = loserTags.filter((t) => existing.has(t.tag_id)).map((t) => t.id);
    if (toMove.length > 0) {
      const { error } = await supabase
        .from('publication_tags')
        .update({ publication_id: plan.survivorId })
        .in('id', toMove);
      if (error) throw new Error(`moving tags: ${error.message}`);
    }
    if (toDrop.length > 0) {
      const { error } = await supabase.from('publication_tags').delete().in('id', toDrop);
      if (error) throw new Error(`dropping duplicate tags: ${error.message}`);
    }
  }

  // re-point relations; drop any that would now relate the survivor to itself
  const { data: relations, error: relationError } = await supabase
    .from('publication_relations')
    .select('id, publication_id, related_publication_id')
    .or(`publication_id.eq.${plan.loserId},related_publication_id.eq.${plan.loserId}`);
  if (relationError) throw new Error(`reading relations: ${relationError.message}`);
  for (const relation of relations ?? []) {
    const from = relation.publication_id === plan.loserId ? plan.survivorId : relation.publication_id;
    const to = relation.related_publication_id === plan.loserId ? plan.survivorId : relation.related_publication_id;
    if (from === to) {
      const { error } = await supabase.from('publication_relations').delete().eq('id', relation.id);
      if (error) throw new Error(`dropping self-relation: ${error.message}`);
      continue;
    }
    const { error } = await supabase
      .from('publication_relations')
      .update({ publication_id: from, related_publication_id: to })
      .eq('id', relation.id);
    if (error) throw new Error(`re-pointing relation: ${error.message}`);
  }

  const { error: deleteError, count } = await supabase
    .from('publications')
    .delete({ count: 'exact' })
    .eq('id', plan.loserId);
  if (deleteError) throw new Error(`deleting duplicate: ${deleteError.message}`);
  if (!count) throw new Error('the duplicate row could not be deleted — you may not have permission');
}
