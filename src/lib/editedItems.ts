// SPEC.md T51: a recurring item/budget shows the "edited" pencil indicator
// (T29's Forecast-row marker, extended to the item level) whenever it has
// *any* occurrence_overrides (or budget_replenish_overrides) row at all -
// including a pure skip, since a skipped occurrence is still a deviation
// from the item's default schedule even though skips never render as their
// own Forecast row.
export function idSetFromColumn<K extends string>(
  rows: Record<K, string>[] | null | undefined,
  column: K,
): Set<string> {
  return new Set((rows ?? []).map((row) => row[column]));
}
