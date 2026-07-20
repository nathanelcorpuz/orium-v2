export type RecurringItemType = "bill" | "income" | "debt" | "savings";

export type RecurringFrequency = "monthly" | "weekly" | "biweekly" | "semi_monthly_15_30";

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
  frequency: RecurringFrequency;
  dayOfMonth: number | null; // 1-31, for "monthly"
  weekday: number | null; // 0-6 (Sun-Sat), for "weekly" / "biweekly"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
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

export interface ForecastRow {
  sourceType: "recurring" | "one_off";
  sourceId: string;
  originalDate: string;
  name: string;
  amount: number; // centavos
  dueDate: string;
  type: RecurringItemType | "extra";
  runningBalance: number; // centavos
}

export interface GenerateForecastInput {
  balances: Balance[];
  recurringItems: RecurringItem[];
  overrides: OccurrenceOverride[];
  oneOffs: OneOffItem[];
  today: string; // YYYY-MM-DD
  horizon: string; // YYYY-MM-DD
}
