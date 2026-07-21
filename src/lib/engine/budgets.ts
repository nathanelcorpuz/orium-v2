import type { Budget, BudgetEntry } from "./types";

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function spentInMonth(entries: BudgetEntry[], budgetId: string, yearMonth: string): number {
  return entries
    .filter((entry) => entry.budgetId === budgetId && monthKey(entry.entryDate) === yearMonth)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export interface BudgetMonthStatus {
  remaining: number; // centavos, >= 0
  overBy: number; // centavos, >= 0 (> 0 when spends exceeded the allocation)
}

// Pre-6B baseline rule (SPEC.md T24-T25): remaining = max(allocation - spent, 0); overBy = max(spent - allocation, 0).
// Only entries dated within `today`'s calendar month count toward "spent".
export function currentMonthBudgetStatus(
  budget: Pick<Budget, "id" | "monthlyAllocation">,
  entries: BudgetEntry[],
  today: string,
): BudgetMonthStatus {
  const spent = spentInMonth(entries, budget.id, monthKey(today));
  return {
    remaining: Math.max(budget.monthlyAllocation - spent, 0),
    overBy: Math.max(spent - budget.monthlyAllocation, 0),
  };
}

export interface BudgetOccurrence {
  date: string; // YYYY-MM-DD
  amount: number; // centavos, <= 0 (outflow)
}

/**
 * Expands one budget into forecast occurrences per the pre-6B baseline
 * (SPEC.md T24-T25; T37 replaces this with the cycle/carryover model):
 * - current month: one row dated `today`, amount = -remaining (rule 1)
 * - future months: one row per month dated the 1st, amount = -full allocation (rule 2),
 *   with no rollover from prior months (rule 3)
 */
export function expandBudgetOccurrences(
  budget: Pick<Budget, "id" | "monthlyAllocation">,
  entries: BudgetEntry[],
  today: string,
  horizon: string,
): BudgetOccurrence[] {
  const occurrences: BudgetOccurrence[] = [];

  const { remaining } = currentMonthBudgetStatus(budget, entries, today);
  occurrences.push({ date: today, amount: remaining === 0 ? 0 : -remaining });

  const [todayYear, todayMonth] = today.split("-").map(Number);
  let year = todayYear;
  let month = todayMonth + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }

  while (true) {
    const date = firstOfMonth(year, month);
    if (date > horizon) break;
    occurrences.push({ date, amount: -budget.monthlyAllocation });

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return occurrences;
}
