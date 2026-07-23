import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecurrenceRule } from "./engine/types";
import { expandRecurrenceOccurrences } from "./engine/recurrence";

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
