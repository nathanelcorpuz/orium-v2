import { createClient } from "@/lib/supabase/server";
import { todayInManila } from "@/lib/date";
import { formatDate } from "@/lib/engine/date-utils";
import { generateForecast } from "@/lib/engine/forecast";
import type {
  Balance,
  ForecastRow,
  GenerateForecastInput,
  OccurrenceOverride,
  OneOffItem,
  RecurringItem,
} from "@/lib/engine/types";

const DEFAULT_BALANCE_RANGES = [0, 500000, 2000000, 5000000, 10000000];
const DEFAULT_CURRENCY = "₱";

function addYears(dateStr: string, years: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year + years, month - 1, day));
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export type ForecastData = {
  forecast: ForecastRow[];
  balances: Balance[];
  currency: string;
  balanceRanges: number[];
  today: string;
};

export async function loadForecast(): Promise<ForecastData> {
  const supabase = await createClient();
  const today = todayInManila();
  const horizon = addYears(today, 3);

  const [balancesRes, recurringRes, overridesRes, oneOffsRes, preferencesRes] = await Promise.all([
    supabase.from("balances").select("id, name, amount"),
    supabase
      .from("recurring_items")
      .select("id, name, type, amount, frequency, day_of_month, weekday, start_date, end_date"),
    supabase
      .from("occurrence_overrides")
      .select("id, recurring_item_id, original_date, new_date, new_amount, new_name, skipped"),
    supabase.from("one_off_items").select("id, name, amount, due_date"),
    supabase.from("preferences").select("currency, balance_ranges").single(),
  ]);

  const balances: Balance[] = balancesRes.data ?? [];

  const recurringItems: RecurringItem[] = (recurringRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    amount: row.amount,
    frequency: row.frequency,
    dayOfMonth: row.day_of_month,
    weekday: row.weekday,
    startDate: row.start_date,
    endDate: row.end_date,
  }));

  const overrides: OccurrenceOverride[] = (overridesRes.data ?? []).map((row) => ({
    id: row.id,
    recurringItemId: row.recurring_item_id,
    originalDate: row.original_date,
    newDate: row.new_date,
    newAmount: row.new_amount,
    newName: row.new_name,
    skipped: row.skipped,
  }));

  const oneOffs: OneOffItem[] = (oneOffsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    amount: row.amount,
    dueDate: row.due_date,
  }));

  const input: GenerateForecastInput = { balances, recurringItems, overrides, oneOffs, today, horizon };

  return {
    forecast: generateForecast(input),
    balances,
    currency: preferencesRes.data?.currency ?? DEFAULT_CURRENCY,
    balanceRanges: preferencesRes.data?.balance_ranges ?? DEFAULT_BALANCE_RANGES,
    today,
  };
}
