import { createClient } from "@/lib/supabase/server";
import { BudgetsClient } from "./BudgetsClient";
import type { BudgetEntryRow, IncomeItemRow, OverrideRow } from "./BudgetCard";
import type { BudgetRow } from "./BudgetModal";

export default async function BudgetsPage() {
  const supabase = await createClient();

  const [budgetsRes, entriesRes, incomesRes, overridesRes] = await Promise.all([
    supabase
      .from("budgets")
      .select(
        "id, name, monthly_allocation, allocation, carryover_enabled, created_at, linked_income_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count",
      )
      .order("name", { ascending: true }),
    // Not bounded to the current calendar month: a budget's cycle boundary
    // (linked income, own schedule, or fallback) rarely lines up with the
    // 1st, so computeBudgetCycleStatus needs every entry to walk carryover
    // correctly from the budget's first cycle.
    supabase
      .from("budget_entries")
      .select("id, budget_id, entry_date, amount, note")
      .order("entry_date", { ascending: true }),
    supabase
      .from("recurring_items")
      .select(
        "id, name, type, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count",
      )
      .eq("type", "income")
      .order("name", { ascending: true }),
    supabase
      .from("occurrence_overrides")
      .select("id, recurring_item_id, original_date, new_date, new_amount, new_name, skipped"),
  ]);

  if (budgetsRes.error) {
    return <p className="p-8 text-red-600">Could not load budgets: {budgetsRes.error.message}</p>;
  }
  if (entriesRes.error) {
    return (
      <p className="p-8 text-red-600">Could not load budget entries: {entriesRes.error.message}</p>
    );
  }
  if (incomesRes.error) {
    return <p className="p-8 text-red-600">Could not load income sources: {incomesRes.error.message}</p>;
  }
  if (overridesRes.error) {
    return <p className="p-8 text-red-600">Could not load overrides: {overridesRes.error.message}</p>;
  }

  const budgets: BudgetRow[] = budgetsRes.data ?? [];

  const entriesByBudgetId: Record<string, BudgetEntryRow[]> = {};
  for (const entry of entriesRes.data ?? []) {
    const list = entriesByBudgetId[entry.budget_id] ?? [];
    list.push({
      id: entry.id,
      entry_date: entry.entry_date,
      amount: entry.amount,
      note: entry.note,
    });
    entriesByBudgetId[entry.budget_id] = list;
  }

  const incomes: IncomeItemRow[] = incomesRes.data ?? [];
  const overrides: OverrideRow[] = overridesRes.data ?? [];

  return (
    <BudgetsClient
      budgets={budgets}
      entriesByBudgetId={entriesByBudgetId}
      incomes={incomes}
      overrides={overrides}
    />
  );
}
