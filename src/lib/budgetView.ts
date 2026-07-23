import type { Budget, BudgetEntry } from "./engine/types";

// Shared display plumbing for budgets (SPEC.md Phase 10) - the snake_case-
// DB-row -> engine-type conversion used by the Budgets page and
// forecastData.ts.

export type BudgetRow = {
  id: string;
  name: string;
  monthly_allocation: number;
  allocation: number;
  created_at: string;
  linked_income_id: string | null;
};

export type BudgetEntryRow = {
  id: string;
  entry_date: string;
  amount: number;
  note: string | null;
  // Phase 10 (migration 0009): 'incoming' (replenishment) or 'outgoing' (a
  // spend or manual take) - see budgetLedger.ts.
  direction?: "incoming" | "outgoing";
};

export function toEngineBudget(budget: BudgetRow): Budget {
  return {
    id: budget.id,
    name: budget.name,
    allocation: budget.allocation,
    createdAt: budget.created_at.slice(0, 10),
    linkedIncomeId: budget.linked_income_id,
  };
}

export function toEngineEntries(entries: BudgetEntryRow[], budgetId: string): BudgetEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    budgetId,
    entryDate: entry.entry_date,
    amount: entry.amount,
    note: entry.note,
    direction: entry.direction,
  }));
}
