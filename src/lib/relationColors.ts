import type { RelationType } from '@/types/database';

/**
 * Colour for each relation type, shared by the relationship graph legend and the related-papers
 * list. Typed against RelationType, so adding a type without a colour fails to compile.
 */
export const RELATION_COLORS: Record<RelationType, string> = {
  cites: '#22c55e',
  extends: '#3b82f6',
  builds_on: '#8b5cf6',
  contradicts: '#ef4444',
  reviews: '#f97316',
  related: '#94a3b8',
};

export function relationColor(type: string): string {
  return (RELATION_COLORS as Record<string, string>)[type] ?? RELATION_COLORS.related;
}
