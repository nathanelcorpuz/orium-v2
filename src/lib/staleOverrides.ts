import type { SupabaseClient } from "@supabase/supabase-js";
import type { Budget, OccurrenceOverride, RecurrenceRule, RecurringItem } from "./engine/types";
import { expandRecurrenceOccurrences } from "./engine/recurrence";
import { resolveBoundaries } from "./engine/budgetCycles";

// SPEC.md T42 part A: editing a recurring item's rule directly from its own
// page (Bills/Income/Debt/Savings) shouldn't leave per-occurrence overrides
// (moved/changed/skipped via the Forecast page) pointing at dates the new
// rule no longer produces - those rows are permanently orphaned dead weight
// otherwise, since nothing in the forecast pipeline will ever look them up
// again. Only *stale* overrides are removed: for each one, a tight
// [date, date] expansion under the NEW rule either reproduces that exact
// date (still valid, left untouched - including already-skipped/settled
// ones, since removing the override never touches the separate, permanent
// `settlements` record) or doesn't (stale, deleted).
export async function deleteStaleOverrides(
  supabase: SupabaseClient,
  recurringItemId: string,
  newRule: RecurrenceRule,
): Promise<void> {
  const { data: overrides } = await supabase
    .from("occurrence_overrides")
    .select("id, original_date")
    .eq("recurring_item_id", recurringItemId);

  const staleIds = (overrides ?? [])
    .filter((o) => expandRecurrenceOccurrences(newRule, o.original_date, o.original_date).length === 0)
    .map((o) => o.id);

  if (staleIds.length > 0) {
    await supabase.from("occurrence_overrides").delete().in("id", staleIds);
  }
}

// Same idea, for a budget's own future-row overrides (SPEC.md T42 part B):
// editing a budget's allocation/replenish-source runs this too. A budget's
// boundaries aren't a single expandable rule (linked income / own schedule /
// fallback - see budgetCycles.ts), so instead of a tight date-window
// expansion, resolveBoundaries is asked "what are the real boundaries up to
// and including this override's date" and the date must be the last one
// returned to still be valid.
export async function deleteStaleBudgetOverrides(
  supabase: SupabaseClient,
  budgetId: string,
  newBudget: Budget,
  recurringItems: RecurringItem[],
  incomeOverrides: OccurrenceOverride[],
): Promise<void> {
  const { data: overrides } = await supabase
    .from("budget_occurrence_overrides")
    .select("id, original_date")
    .eq("budget_id", budgetId);

  const staleIds = (overrides ?? [])
    .filter((o) => {
      const { boundaries } = resolveBoundaries(newBudget, recurringItems, incomeOverrides, o.original_date);
      return !boundaries.includes(o.original_date);
    })
    .map((o) => o.id);

  if (staleIds.length > 0) {
    await supabase.from("budget_occurrence_overrides").delete().in("id", staleIds);
  }
}
