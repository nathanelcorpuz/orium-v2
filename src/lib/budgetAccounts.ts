import type { SupabaseClient } from "@supabase/supabase-js";

// T204: a budget account is deliberately separate from `balances` - it's
// storage for budgets, never part of the cash-flow engine, so there's no
// fee to deduct here the way applyToBalance (forecast/actions.ts) has to.
// Read-then-write, matching every other ledger-backed balance update in
// this app (applyToBalance, accounts/actions.ts's adjustBalance) - accepted
// non-transactional risk for a single-user/family app, same precedent.
export async function applyToBudgetAccount(
  supabase: SupabaseClient,
  budgetAccountId: string,
  delta: number,
): Promise<string | null> {
  const { data: account, error: fetchError } = await supabase
    .from("budget_accounts")
    .select("amount")
    .eq("id", budgetAccountId)
    .single();
  if (fetchError) return fetchError.message;

  const { error: updateError } = await supabase
    .from("budget_accounts")
    .update({ amount: account.amount + delta })
    .eq("id", budgetAccountId);
  return updateError?.message ?? null;
}

export type BudgetAccountLink = {
  budgetAccountId: string;
  replenishAmount: number;
  name: string;
};

// T218: every budget account currently connected to a budget, in the order
// they were connected - the order both a manual-action picker and the
// per-account breakdown line show accounts in. Replaces the single
// `budgets.budget_account_id` lookup every caller used before T218.
export async function loadBudgetAccountLinks(
  supabase: SupabaseClient,
  budgetId: string,
): Promise<BudgetAccountLink[]> {
  const { data } = await supabase
    .from("budget_budget_accounts")
    .select("budget_account_id, replenish_amount, budget_accounts(name)")
    .eq("budget_id", budgetId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    budgetAccountId: row.budget_account_id as string,
    replenishAmount: row.replenish_amount as number,
    // Untyped Supabase client infers the embedded relation as an array
    // (the safe default without generated types), same as elsewhere in
    // this app (see budgets/actions.ts's deleteBudgetEntry).
    name: (row.budget_accounts as unknown as { name: string }[])[0]?.name ?? "",
  }));
}
