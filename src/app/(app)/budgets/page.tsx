import { createClient } from "@/lib/supabase/server";
import { idSetFromColumn } from "@/lib/editedItems";
import { BudgetsClient } from "./BudgetsClient";
import type { BudgetEntryRow, IncomeItemRow } from "./BudgetCard";
import type { BudgetRow } from "./BudgetModal";

export default async function BudgetsPage() {
  const supabase = await createClient();

  const [budgetsRes, entriesRes, incomesRes, replenishOverridesRes] = await Promise.all([
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
    // Phase 11 (T60): the recurrence rule columns too, not just id/name - an
    // income-linked budget's "days until replenish" progress bar
    // (BudgetCard.tsx) resolves its schedule from whichever income it's
    // linked to, via budgetReplenishRule (engine/budgetLedger.ts).
    supabase
      .from("recurring_items")
      .select(
        "id, name, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count",
      )
      .eq("type", "income")
      .order("name", { ascending: true }),
    // T51: any budget_replenish_overrides row (including a pure skip) marks
    // the budget itself as edited - the table SPEC.md calls
    // "budget_occurrence_overrides" was dropped in migration 0010 and
    // replaced by this one in migration 0011 (T59).
    supabase.from("budget_replenish_overrides").select("budget_id"),
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
  if (replenishOverridesRes.error) {
    return (
      <p className="p-8 text-red-600">
        Could not load budget overrides: {replenishOverridesRes.error.message}
      </p>
    );
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

  const incomes: IncomeItemRow[] = (incomesRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    interval: row.interval,
    unit: row.unit,
    weekdays: row.weekdays,
    daysOfMonth: row.days_of_month,
    ordinal: row.ordinal,
    ordinalWeekday: row.ordinal_weekday,
    endsType: row.ends_type,
    endDate: row.end_date,
    occurrenceCount: row.occurrence_count,
  }));

  const editedIds = idSetFromColumn(replenishOverridesRes.data, "budget_id");

  return (
    <BudgetsClient
      budgets={budgets}
      entriesByBudgetId={entriesByBudgetId}
      incomes={incomes}
      editedIds={editedIds}
    />
  );
}
