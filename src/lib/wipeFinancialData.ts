import type { createClient } from "@/lib/supabase/server";

// T97: every financial/transactional table, in FK-safe (child-before-parent)
// order. Matches `supabase/wipe_test_data.sql`'s exact table list and order.
// Deliberately excludes `preferences` - a currency symbol or custom balance
// thresholds are a display preference, not "data" in the sense any caller
// here means to wipe, and `wipe_test_data.sql` already established that same
// precedent.
//
// NOTE: this used to be a shorter, out-of-date list on `deleteAccount` alone
// (missing `budgets`, `budget_entries`, and `budget_replenish_overrides`
// entirely) - a real bug, since account deletion silently left every budget
// behind. Fixed when the list became shared.
//
// T120: lifted out of `settings/actions.ts` into this plain module so the
// post-tour "explore with test data" action and the dev-only onboarding
// reset route can reuse the exact same list and order rather than each
// re-deriving it - the ordering is FK-sensitive, so a drifting copy is a
// real bug waiting to happen, and a `"use server"` file can't export a
// helper taking a Supabase client anyway (every export there becomes a
// server action, whose arguments must be serializable).
export const FINANCIAL_DATA_TABLES = [
  "budget_entries",
  "budget_replenish_overrides",
  "occurrence_overrides",
  "settlements",
  "reminders",
  "budgets",
  "one_off_items",
  "recurring_items",
  "balances",
] as const;

export async function wipeFinancialData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  for (const table of FINANCIAL_DATA_TABLES) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) return error.message;
  }
  return null;
}
