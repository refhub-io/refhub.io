export function orderImportPreviewIndices(
  totalCount: number,
  duplicateIndices: Set<number>,
): number[] {
  return Array.from({ length: totalCount }, (_, index) => index).sort((left, right) => {
    const leftPriority = duplicateIndices.has(left) ? 0 : 1;
    const rightPriority = duplicateIndices.has(right) ? 0 : 1;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left - right;
  });
}
