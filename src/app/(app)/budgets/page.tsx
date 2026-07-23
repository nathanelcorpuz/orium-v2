import { createClient } from "@/lib/supabase/server";
import { BudgetsClient } from "./BudgetsClient";
import type { BudgetEntryRow, IncomeItemRow } from "./BudgetCard";
import type { BudgetRow } from "./BudgetModal";

export default async function BudgetsPage() {
  const supabase = await createClient();

  const [budgetsRes, entriesRes, incomesRes] = await Promise.all([
    supabase
      .from("budgets")
      .select(
        "id, name, monthly_allocation, allocation, created_at, linked_income_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count",
      )
      .order("name", { ascending: true }),
    // Every entry, not just the current month - a budget's running total
    // (SPEC.md Phase 10, budgetLedger.ts) needs its full history; the month
    // filter in BudgetCard narrows what's *displayed* client-side.
    supabase
      .from("budget_entries")
      .select("id, budget_id, entry_date, amount, note, direction")
      .order("entry_date", { ascending: true }),
    supabase
      .from("recurring_items")
      .select("id, name, type")
      .eq("type", "income")
      .order("name", { ascending: true }),
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

  const budgets: BudgetRow[] = budgetsRes.data ?? [];

  const entriesByBudgetId: Record<string, BudgetEntryRow[]> = {};
  for (const entry of entriesRes.data ?? []) {
    const list = entriesByBudgetId[entry.budget_id] ?? [];
    list.push({
      id: entry.id,
      entry_date: entry.entry_date,
      amount: entry.amount,
      note: entry.note,
      direction: entry.direction,
    });
    entriesByBudgetId[entry.budget_id] = list;
  }

  const incomes: IncomeItemRow[] = incomesRes.data ?? [];

  return <BudgetsClient budgets={budgets} entriesByBudgetId={entriesByBudgetId} incomes={incomes} />;
}
