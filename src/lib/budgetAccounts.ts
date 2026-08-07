import type { SupabaseClient } from "@supabase/supabase-js";

// T284 (SPEC.md Phase 49): a budget's connected account is now a plain
// `balances` row - "just one accounts category," no separate storage table.
// Read-then-write, matching every other ledger-backed balance update in
// this app (accounts/actions.ts's adjustBalance, forecast/actions.ts's
// applyToBalance) - accepted non-transactional risk for a single-user/
// family app, same precedent. Deliberately no fee here (unlike
// applyToBalance) - a budget replenishment/manual action is bookkeeping
// against the user's own money, not a real external settlement.
export async function applyToBudgetAccount(
  supabase: SupabaseClient,
  balanceId: string,
  delta: number,
): Promise<string | null> {
  const { data: account, error: fetchError } = await supabase
    .from("balances")
    .select("amount")
    .eq("id", balanceId)
    .single();
  if (fetchError) return fetchError.message;

  const { error: updateError } = await supabase
    .from("balances")
    .update({ amount: account.amount + delta })
    .eq("id", balanceId);
  return updateError?.message ?? null;
}

export type BudgetAccountLink = {
  balanceId: string;
  replenishAmount: number;
  name: string;
};

// T218: every account currently connected to a budget, in the order they
// were connected - the order both a manual-action picker and the
// per-account breakdown line show accounts in. Replaces the single
// `budgets.budget_account_id` lookup every caller used before T218.
export async function loadBudgetAccountLinks(
  supabase: SupabaseClient,
  budgetId: string,
): Promise<BudgetAccountLink[]> {
  const { data } = await supabase
    .from("budget_budget_accounts")
    .select("balance_id, replenish_amount, balances(name)")
    .eq("budget_id", budgetId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    balanceId: row.balance_id as string,
    replenishAmount: row.replenish_amount as number,
    // Untyped Supabase client infers the embedded relation as an array
    // (the safe default without generated types), same as elsewhere in
    // this app (see budgets/actions.ts's deleteBudgetEntry).
    name: (row.balances as unknown as { name: string }[])[0]?.name ?? "",
  }));
}
