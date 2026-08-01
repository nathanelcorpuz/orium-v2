"use server";

import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import type { ForecastRow, RecurringItemType } from "@/lib/engine/types";

export type ItemSettlementRow = {
  id: string;
  name: string;
  forecasted_amount: number;
  actual_amount: number;
  forecasted_date: string;
  actual_date: string;
};

// Lazy loading (user request 2026-08-01): Bills/Income/Debt/Savings used to
// precompute every item's upcoming occurrences and every settled
// transaction, for every item, on every page load - even though only one
// item's data is ever shown at a time, only when that item's own "view
// transactions" modal (ItemTransactionsModal.tsx) is actually opened. This
// server action runs on that click instead, and returns just the one item's
// slice. `loadForecast()` still runs the full engine (an item's occurrences
// aren't independently computable without it - duplicating that logic here
// is exactly the "two implementations of the same thing" mistake Bug #12
// already taught this app not to repeat), so server compute isn't reduced,
// but the payload shipped to the browser is - both by deferring it until
// actually requested, and by narrowing it to one item instead of every one.
export async function getItemTransactions(
  itemId: string,
  itemType: RecurringItemType,
): Promise<{ upcoming: ForecastRow[]; paid: ItemSettlementRow[] }> {
  const supabase = await createClient();
  const [{ forecast }, settlementsRes] = await Promise.all([
    loadForecast(),
    supabase
      .from("settlements")
      .select("id, name, forecasted_amount, actual_amount, forecasted_date, actual_date")
      .eq("type", itemType)
      .eq("source_id", itemId)
      .order("actual_date", { ascending: false }),
  ]);

  // T188's existing scoping, unchanged: "upcoming" excludes any unsettled
  // past-due backlog - a months-old missed payment showing as "next up"
  // would read as a bug, not a feature.
  const upcoming = forecast.filter(
    (row) => row.sourceType === "recurring" && row.sourceId === itemId && row.type === itemType && !row.pastDue,
  );

  return { upcoming, paid: settlementsRes.data ?? [] };
}

// Debt/Savings' `goalProgress` needs a *count* of paid settlements per item,
// always visible (not behind a click) for the active/completed split and
// progress bar - unlike the full upcoming/paid detail above, this can't be
// deferred. Kept far lighter than the old full-row fetch (source_id only,
// no dates/amounts) since a count is all `goalProgress` ever reads.
export async function getSettlementCountsByItemId(itemType: RecurringItemType): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("settlements").select("source_id").eq("type", itemType);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.source_id, (counts.get(row.source_id) ?? 0) + 1);
  }
  return counts;
}
