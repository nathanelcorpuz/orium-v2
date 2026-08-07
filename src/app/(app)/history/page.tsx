import { createClient } from "@/lib/supabase/server";
import { HistoryClient } from "./HistoryClient";

export default async function HistoryPage() {
  const supabase = await createClient();

  const [settlementsRes, preferencesRes, balancesRes] = await Promise.all([
    supabase
      .from("settlements")
      .select(
        "id, name, type, forecasted_amount, actual_amount, forecasted_date, actual_date, forecasted_balance, balance_id",
      )
      .order("actual_date", { ascending: false }),
    supabase.from("preferences").select("currency").single(),
    // T217/T284: resolve each settlement's balance_id to a real name for the
    // Account column - just id/name, same minimal shape every other page
    // uses for this. A budget settlement now uses this same column (the old
    // separate `budget_account_id`/`budget_accounts` table is gone -
    // migration 0054).
    supabase.from("balances").select("id, name"),
  ]);

  if (settlementsRes.error) {
    return <p className="p-8 text-red-600">Could not load history: {settlementsRes.error.message}</p>;
  }

  return (
    <HistoryClient
      rows={settlementsRes.data ?? []}
      currency={preferencesRes.data?.currency ?? "₱"}
      balances={balancesRes.data ?? []}
    />
  );
}
