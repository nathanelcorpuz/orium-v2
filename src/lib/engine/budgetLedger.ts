import type { BudgetEntry } from "./types";

// Budgets v3 (SPEC.md Phase 10): a budget is a simple running ledger, not a
// cycle that resets on a schedule. Every budget_entries row is either money
// IN ("incoming" - a replenishment, from a settled linked income or a
// manual add) or money OUT ("outgoing" - a logged spend or a manual take).
// A budget's current total is just sum(incoming) - sum(outgoing) for
// entries dated today or earlier - carryover is implicit (there's no cycle
// to reset), and overspending is allowed to go negative, same as a real
// account. As of T57 this is the only budget engine module - the old
// cycle/allocation/carryover model (budgetCycles.ts) has been deleted.

function signedAmount(entry: BudgetEntry): number {
  return entry.direction === "incoming" ? entry.amount : -entry.amount;
}

/**
 * A budget's current available total: every entry dated `asOf` or earlier,
 * incoming minus outgoing. Future-dated entries (whether incoming or
 * outgoing) haven't happened yet, so they don't count here - they show up
 * as their own Forecast rows instead (see futureBudgetLedgerEntries). Can
 * go negative (overspend) - no clamping, unlike the old cycle model.
 */
export function computeBudgetBalance(entries: BudgetEntry[], budgetId: string, asOf: string): number {
  return entries
    .filter((e) => e.budgetId === budgetId && e.entryDate <= asOf)
    .reduce((sum, e) => sum + signedAmount(e), 0);
}

/**
 * This budget's entries dated after `today`, sorted ascending - each
 * renders as its own Forecast row (forecast.ts) rather than affecting the
 * current total, the same pattern T43 established for future-dated spends,
 * now covering incoming entries too (e.g. a future-dated manual "add
 * funds").
 */
export function futureBudgetLedgerEntries(entries: BudgetEntry[], budgetId: string, today: string): BudgetEntry[] {
  return entries
    .filter((e) => e.budgetId === budgetId && e.entryDate > today)
    .sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : 0));
}
