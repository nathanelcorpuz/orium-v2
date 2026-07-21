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

export interface Budget {
  id: string;
  name: string;

  // Pre-6B baseline (T24/T25). Still used by the currently-deployed
  // Budgets page (BudgetCard.tsx) via currentMonthBudgetStatus/
  // expandBudgetOccurrences in budgets.ts - untouched by T37, since those
  // are the only live UI consumers left. Dropped once T38 ships (see
  // migration 0007).
  monthlyAllocation: number; // centavos

  // Budgets v2 (SPEC.md Phase 6B, migration 0006). allocation/
  // carryoverEnabled are DB NOT NULL; the rest describe the budget's own
  // schedule and are null when relying on linkedIncomeId or the fallback.
  // Consumed by budgetCycles.ts (T37) - not yet wired into forecast.ts;
  // that's T39.
  allocation: number; // centavos, >= 0
  carryoverEnabled: boolean;
  createdAt: string; // YYYY-MM-DD; anchors the fallback schedule's cycle 0 (see budgetCycles.ts)
  linkedIncomeId: string | null;
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
  amount: number; // centavos, positive = money spent
  note: string | null;
}

// Per-occurrence override for a budget's own *future* forecast rows
// (SPEC.md T42 part B) - mirrors OccurrenceOverride, but only ever keyed
// against a future cycle-boundary date. The "remaining this cycle" row
// (always dated today) has no override concept and never looks this up -
// see forecast.ts's budget merge loop, the only place these are applied.
export interface BudgetOccurrenceOverride {
  id: string;
  budgetId: string;
  originalDate: string; // YYYY-MM-DD, a raw future boundary date
  newDate: string | null;
  newAmount: number | null; // centavos
  skipped: boolean;
}

export interface ForecastRow {
  sourceType: "recurring" | "one_off" | "budget";
  sourceId: string;
  originalDate: string;
  name: string;
  amount: number; // centavos
  dueDate: string;
  type: RecurringItemType | "extra" | "budget";
  runningBalance: number; // centavos
}

export interface GenerateForecastInput {
  balances: Balance[];
  recurringItems: RecurringItem[];
  overrides: OccurrenceOverride[];
  oneOffs: OneOffItem[];
  budgets?: Budget[];
  budgetEntries?: BudgetEntry[];
  budgetOverrides?: BudgetOccurrenceOverride[];
  today: string; // YYYY-MM-DD
  horizon: string; // YYYY-MM-DD
}
