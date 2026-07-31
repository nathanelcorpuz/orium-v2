import { todayInManila } from "@/lib/date";
import { addDays, addYears, MAX_TRACKING_YEARS } from "@/lib/engine/date-utils";
import { generateForecast } from "@/lib/engine/forecast";
import { DEFAULT_TIER_LABELS } from "@/lib/balanceColor";
import type { ForecastBalance, ForecastData } from "@/lib/forecastData";
import type { Budget, BudgetEntry, GenerateForecastInput, OneOffItem, RecurringItem } from "@/lib/engine/types";
import type { ReminderRow } from "@/app/(app)/forecast/RemindersPanel";

const DEFAULT_BALANCE_RANGES = [0, 500000, 2000000, 5000000, 10000000];

const WALLET_ID = "preview-bal-wallet";
const SAVINGS_BAL_ID = "preview-bal-savings";
const GROCERIES_BUDGET_ID = "preview-budget-groceries";

// Shared defaults for a plain monthly-on-day-N recurring item, so each
// fixture item below only specifies what makes it distinct - same "sample
// item builder" pattern the engine's own tests use (forecast.test.ts's
// `monthlyItem`).
function recurring(
  overrides: Partial<RecurringItem> & Pick<RecurringItem, "id" | "name" | "type" | "amount">,
  startDate: string,
): RecurringItem {
  return {
    startDate,
    balanceId: WALLET_ID,
    interval: 1,
    unit: "month",
    weekdays: null,
    daysOfMonth: null,
    ordinal: null,
    ordinalWeekday: null,
    endsType: "never",
    endDate: null,
    occurrenceCount: null,
    ...overrides,
  };
}

// T103: a static "sample family" fixture for opt-in preview mode - reuses
// the real forecast engine (generateForecast, same pipeline loadForecast()
// runs against real Supabase data) so preview numbers are computed exactly
// the same way real ones are, not hand-typed. Every date is relative to
// *today* (computed at call time, not baked in), so the story - income and
// bills flowing normally, then a large one-off expense dips the balance
// into the red a few weeks out and it recovers over the following months -
// never goes stale no matter when someone opens the preview.
//
// `sampleDataSeededAt` is deliberately always `null` here (nothing was
// actually seeded) - this also means T97's SampleDataBanner and T102's
// end-of-tour "keep or reset?" prompt never fire during a preview session,
// since both key off that same field. Neither should ever be reachable from
// preview mode: both lead to real, destructive server actions
// (resetData/restoreSampleData) that must never run against a session that
// might belong to a user with real data sitting untouched behind it.
export function getSampleFixtureData(): ForecastData {
  const today = todayInManila();
  const horizon = addYears(today, MAX_TRACKING_YEARS);
  const startDate = addDays(today, -180);

  const balances: ForecastBalance[] = [
    { id: WALLET_ID, name: "Everyday wallet", amount: 2_500_000, comments: null },
    { id: SAVINGS_BAL_ID, name: "Savings account", amount: 1_500_000, comments: null },
  ];

  const recurringItems: RecurringItem[] = [
    recurring(
      { id: "preview-inc-salary", name: "Salary - NJ", type: "income", amount: 3_500_000, daysOfMonth: [15, 30] },
      startDate,
    ),
    recurring(
      {
        id: "preview-inc-freelance",
        name: "Freelance - Sheena",
        type: "income",
        amount: 300_000,
        unit: "week",
        weekdays: [5],
      },
      startDate,
    ),
    recurring({ id: "preview-bill-rent", name: "Rent", type: "bill", amount: -1_800_000, daysOfMonth: [1] }, startDate),
    recurring(
      { id: "preview-bill-internet", name: "Internet", type: "bill", amount: -150_000, daysOfMonth: [5] },
      startDate,
    ),
    recurring(
      { id: "preview-bill-electricity", name: "Electricity", type: "bill", amount: -300_000, daysOfMonth: [10] },
      startDate,
    ),
    recurring(
      {
        id: "preview-debt-car",
        name: "Car loan",
        type: "debt",
        amount: -500_000,
        daysOfMonth: [20],
        endsType: "on_date",
        endDate: addYears(today, 2),
      },
      startDate,
    ),
    recurring(
      {
        id: "preview-sav-emergency",
        name: "Orius's college fund",
        type: "savings",
        amount: -300_000,
        daysOfMonth: [25],
        balanceId: SAVINGS_BAL_ID,
        endsType: "on_date",
        endDate: addYears(today, 3),
      },
      startDate,
    ),
  ];

  // A large near-term one-off (relative to the modest starting balance)
  // guarantees a real negative dip regardless of exactly how the monthly
  // items line up day-to-day, without needing T88-style trial-and-error
  // calibration against the live engine - it's simply much bigger than
  // ~3 weeks of ordinary cash flow could possibly absorb.
  const oneOffs: OneOffItem[] = [
    {
      id: "preview-extra-repair",
      name: "Emergency car repair",
      amount: -15_000_000,
      dueDate: addDays(today, 20),
      balanceId: WALLET_ID,
    },
    {
      id: "preview-extra-bonus",
      name: "Year-end bonus",
      amount: 2_000_000,
      dueDate: addDays(today, 45),
      balanceId: WALLET_ID,
    },
  ];

  const budgets: Budget[] = [
    {
      id: GROCERIES_BUDGET_ID,
      name: "Groceries",
      allocation: 600_000,
      linkedIncomeId: null,
      createdAt: startDate,
      startDate: null,
      interval: null,
      unit: null,
      weekdays: null,
      daysOfMonth: null,
      ordinal: null,
      ordinalWeekday: null,
      endsType: null,
      endDate: null,
      occurrenceCount: null,
    },
  ];

  const budgetEntries: BudgetEntry[] = [
    // A manual budget's `allocation` only credits its running balance when
    // an actual replenish/add-funds entry exists - it's not an ambient
    // starting balance just from being created (Budgets v3, budgetLedger.ts)
    // - so without this entry the two outgoing spends below would leave the
    // demo budget sitting at a confusing -₱3,500 with no funding to explain
    // it.
    {
      id: "preview-entry-0",
      budgetId: GROCERIES_BUDGET_ID,
      entryDate: startDate,
      amount: 600_000,
      note: "Initial funding",
      direction: "incoming",
    },
    {
      id: "preview-entry-1",
      budgetId: GROCERIES_BUDGET_ID,
      entryDate: addDays(today, -10),
      amount: 200_000,
      note: "Weekly groceries",
      direction: "outgoing",
    },
    {
      id: "preview-entry-2",
      budgetId: GROCERIES_BUDGET_ID,
      entryDate: addDays(today, -3),
      amount: 150_000,
      note: "Pantry restock",
      direction: "outgoing",
    },
  ];

  const input: GenerateForecastInput = {
    balances,
    recurringItems,
    overrides: [],
    oneOffs,
    budgets,
    budgetEntries,
    budgetReplenishOverrides: [],
    today,
    horizon,
  };

  return {
    // T150 (Bug #11): past-due rows are dropped here, deliberately. The
    // fixture backdates every rule by 180 days (`startDate` above) purely so
    // the recurrence summaries read like an established household - not
    // because this family owes six months of rent. Preview mode has no
    // settling, so nothing here could ever *be* settled, and without this
    // filter a brand-new user's very first look at Orium (the tour renders
    // preview mode) would be roughly sixty red past-due rows and a wildly
    // negative balance. Real accounts keep their backlog; only this static
    // display fixture is exempt.
    forecast: generateForecast(input).filter((row) => !row.pastDue),
    balances,
    recurringItems,
    overrides: [],
    budgets,
    budgetEntries,
    budgetReplenishOverrides: [],
    currency: "₱",
    balanceRanges: DEFAULT_BALANCE_RANGES,
    tierLabels: DEFAULT_TIER_LABELS,
    sampleDataSeededAt: null,
    today,
    horizon,
  };
}

export const SAMPLE_FIXTURE_REMINDERS: ReminderRow[] = [
  { id: "preview-reminder-1", text: "Try adding your own reminder here!", completed: false },
  { id: "preview-reminder-2", text: "Ask about the car loan's payoff date", completed: true },
];
