export type RecurringItemType = "bill" | "income" | "debt" | "savings";

// SPEC.md Phase 6A recurrence rule shape (migration 0004; the old 4-frequency
// model's columns were dropped by migration 0005 once T35 shipped).
export type RecurrenceUnit = "day" | "week" | "month" | "year";
export type RecurrenceEndsType = "never" | "on_date" | "after_count";

export interface Balance {
  id: string;
  name: string;
  amount: number; // centavos
}

export interface RecurringItem {
  id: string;
  name: string;
  type: RecurringItemType;
  amount: number; // centavos; signed (bills/debt/savings negative, income positive)
  startDate: string; // YYYY-MM-DD

  // Recurrence rule (SPEC.md Phase 6A). interval/unit/endsType are DB
  // NOT NULL - every row has a complete rule. The rest depend on which
  // rule shape is in use (e.g. a week-unit item has null daysOfMonth).
  interval: number; // repeat every N units
  unit: RecurrenceUnit;
  weekdays: number[] | null; // 0-6 (Sun-Sat); for unit "week"
  daysOfMonth: number[] | null; // 1-31; for unit "month"
  ordinal: number | null; // nth-weekday: 1-4 or -1=last; for unit "month"
  ordinalWeekday: number | null; // paired with ordinal
  endsType: RecurrenceEndsType;
  endDate: string | null; // YYYY-MM-DD; set iff endsType is "on_date"
  occurrenceCount: number | null; // set iff endsType is "after_count"
}

// The minimal shape expandRecurrenceOccurrences (recurrence.ts) needs -
// RecurringItem's new-rule fields, narrowed to non-null by the caller once
// it's confirmed an item has actually migrated (see forecast.ts).
export interface RecurrenceRule {
  startDate: string;
  interval: number;
  unit: RecurrenceUnit;
  weekdays: number[] | null;
  daysOfMonth: number[] | null;
  ordinal: number | null; // 1-4 (1st..4th) or -1 (last); unit "month" only
  ordinalWeekday: number | null; // 0-6 (Sun-Sat); paired with ordinal
  endsType: RecurrenceEndsType;
  endDate: string | null;
  occurrenceCount: number | null;
}

export interface OccurrenceOverride {
  id: string;
  recurringItemId: string;
  originalDate: string; // YYYY-MM-DD, identifies which occurrence is overridden
  newDate: string | null;
  newAmount: number | null; // centavos
  newName: string | null;
  skipped: boolean;
}

export interface OneOffItem {
  id: string;
  name: string;
  amount: number; // centavos, signed
  dueDate: string; // YYYY-MM-DD
}

// Budgets v3 - a running ledger (SPEC.md Phase 10, T57 cutover). The old
// cycle/allocation/carryover model (Phase 6B) is gone. Phase 11 (T58)
// re-adds a schedule, but only to drive *when* a budget replenishes, not a
// cycle/boundary/carryover concept - the ledger balance math
// (computeBudgetBalance) is unaffected.
export interface Budget {
  id: string;
  name: string;
  allocation: number; // centavos, >= 0 - how much gets added when this budget replenishes
  linkedIncomeId: string | null;
  createdAt: string; // YYYY-MM-DD

  // Phase 11 (T58): a budget's own replenish schedule ("replenish every"),
  // set only when linkedIncomeId is null (DB-enforced mutual exclusivity -
  // migration 0011). Same rule shape as RecurringItem/RecurrenceRule; every
  // field is null together when the budget has no own schedule (it's
  // either income-linked or manual).
  startDate: string | null;
  interval: number | null;
  unit: RecurrenceUnit | null;
  weekdays: number[] | null;
  daysOfMonth: number[] | null;
  ordinal: number | null;
  ordinalWeekday: number | null;
  endsType: RecurrenceEndsType | null;
  endDate: string | null;
  occurrenceCount: number | null;
}

export interface BudgetEntry {
  id: string;
  budgetId: string;
  entryDate: string; // YYYY-MM-DD
  amount: number; // centavos, always a positive magnitude - direction gives the sign
  note: string | null;
  // Budgets v3 (SPEC.md Phase 10, migration 0009): "incoming" (replenishment
  // - a settled linked income or a manual add) or "outgoing" (a logged
  // spend or a manual take) against the budget's running total, consumed by
  // budgetLedger.ts. DB NOT NULL as of migration 0009; kept optional here
  // only so a handful of pre-Phase-10 test literals that never set it don't
  // need touching.
  direction?: "incoming" | "outgoing";
}

export interface ForecastRow {
  // "budget" (a projected cycle-boundary/reservation row) existed under the
  // old model and is gone as of T57 - every budget-related row is now a
  // "budget_entry" (a real future-dated ledger entry).
  sourceType: "recurring" | "one_off" | "budget_entry";
  sourceId: string;
  originalDate: string;
  name: string;
  amount: number; // centavos
  dueDate: string;
  type: RecurringItemType | "extra" | "budget";
  runningBalance: number; // centavos
  // budget_entry rows only (SPEC.md T43): the parent budget's id/name and
  // the entry's own note, separate from `name` (which combines them for
  // display) so EditSettleModal can prefill updateBudgetEntry's form
  // without re-parsing the combined string.
  budgetId?: string;
  budgetName?: string;
  note?: string | null;
  // True when a non-skipped occurrence_overrides row applied to this
  // occurrence (SPEC.md Phase 7 "edited-occurrence indicator") - omitted
  // rather than false so existing forecast.test.ts literals using toEqual
  // don't need updating (toEqual treats a missing key the same as an
  // explicit `undefined`).
  edited?: true;
}

export interface GenerateForecastInput {
  balances: Balance[];
  recurringItems: RecurringItem[];
  overrides: OccurrenceOverride[];
  oneOffs: OneOffItem[];
  budgets?: Budget[];
  budgetEntries?: BudgetEntry[];
  today: string; // YYYY-MM-DD
  horizon: string; // YYYY-MM-DD
}
