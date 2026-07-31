import { createClient } from "@/lib/supabase/server";
import { idSetFromColumn } from "@/lib/editedItems";
import { IncomeClient } from "./IncomeClient";

export default async function IncomePage() {
  const supabase = await createClient();
  const [{ data: incomes, error }, overridesRes, balancesRes, budgetsRes] = await Promise.all([
    supabase
      .from("recurring_items")
      .select(
        "id, name, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments, balance_id, active",
      )
      .eq("type", "income")
      .order("name", { ascending: true }),
    // T51: any occurrence_overrides row (including a pure skip) marks the
    // item itself as edited, not just its individual Forecast occurrences.
    supabase.from("occurrence_overrides").select("recurring_item_id"),
    // T71: options for the optional "connected account" dropdown.
    supabase.from("balances").select("id, name").order("name", { ascending: true }),
    // T71 follow-up: which budgets replenish from each income, for display.
    supabase.from("budgets").select("id, name, linked_income_id").not("linked_income_id", "is", null),
  ]);

  if (error) {
    return <p className="p-8 text-red-600">Could not load income: {error.message}</p>;
  }

  const editedIds = idSetFromColumn(overridesRes.data, "recurring_item_id");

  return (
    <IncomeClient
      incomes={incomes ?? []}
      editedIds={editedIds}
      balances={balancesRes.data ?? []}
      linkedBudgets={budgetsRes.data ?? []}
    />
  );
}
