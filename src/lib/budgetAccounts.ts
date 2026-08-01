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
