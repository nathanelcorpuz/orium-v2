import { createClient } from "@/lib/supabase/server";
import { todayInManila } from "@/lib/date";
import { daysInMonth } from "@/lib/engine/date-utils";
import { BudgetsClient } from "./BudgetsClient";
import type { BudgetEntryRow } from "./BudgetCard";
import type { BudgetRow } from "./BudgetModal";

export default async function BudgetsPage() {
  const supabase = await createClient();
  const today = todayInManila();
  const [year, month] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;

  const [budgetsRes, entriesRes] = await Promise.all([
    supabase
      .from("budgets")
      .select("id, name, monthly_allocation")
      .order("name", { ascending: true }),
    supabase
      .from("budget_entries")
      .select("id, budget_id, entry_date, amount, note")
      .gte("entry_date", monthStart)
      .lte("entry_date", monthEnd)
      .order("entry_date", { ascending: true }),
  ]);

  if (budgetsRes.error) {
    return <p className="p-8 text-red-600">Could not load budgets: {budgetsRes.error.message}</p>;
  }
  if (entriesRes.error) {
    return (
      <p className="p-8 text-red-600">Could not load budget entries: {entriesRes.error.message}</p>
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
    });
    entriesByBudgetId[entry.budget_id] = list;
  }

  return <BudgetsClient budgets={budgets} entriesByBudgetId={entriesByBudgetId} />;
}
