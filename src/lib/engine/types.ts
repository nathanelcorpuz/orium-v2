export type RecurringItemType = "bill" | "income" | "debt" | "savings";

export type RecurringFrequency = "monthly" | "weekly" | "biweekly" | "semi_monthly_15_30";

// SPEC.md Phase 6A recurrence rule shape (migration 0004).
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

  // Legacy 4-frequency model (SPEC.md's old rule shape). Still read/written
  // by the pre-T35 CRUD forms; dropped from the DB by migration 0005 once
  // T35 ships. frequency/dayOfMonth/weekday stay required here because
  // every current form always sets them; endDate is nullable because
  // migrated items using ends_type "never"/"after_count" have none.
  frequency: RecurringFrequency;
  dayOfMonth: number | null; // 1-31, for "monthly"
  weekday: number | null; // 0-6 (Sun-Sat), for "weekly" / "biweekly"
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD; null unless endsType is "on_date"

  // New recurrence rule (SPEC.md Phase 6A). Populated for rows migration
  // 0004 backfilled (i.e. every row in the database today); null/undefined
  // for rows still inserted by the pre-T35 forms, which don't write these
  // yet. See forecast.ts's dispatch: an item is expanded with the new
  // engine (recurrence.ts) only once all of interval/unit/endsType are set.
  interval?: number | null; // repeat every N units
  unit?: RecurrenceUnit | null;
  weekdays?: number[] | null; // 0-6 (Sun-Sat); for unit "week"
  daysOfMonth?: number[] | null; // 1-31; for unit "month"
  ordinal?: number | null; // reserved for T34 (nth-weekday: 1-4 or -1=last)
  ordinalWeekday?: number | null; // reserved for T34
  endsType?: RecurrenceEndsType | null;
  occurrenceCount?: number | null; // set iff endsType is "after_count"
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
  monthlyAllocation: number; // centavos
}

export interface BudgetEntry {
  id: string;
  budgetId: string;
  entryDate: string; // YYYY-MM-DD
  amount: number; // centavos, positive = money spent
  note: string | null;
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
  today: string; // YYYY-MM-DD
  horizon: string; // YYYY-MM-DD
}
