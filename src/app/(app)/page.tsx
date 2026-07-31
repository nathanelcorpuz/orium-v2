import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import { balanceRangeColorClass, balanceRangeTier, firstDangerLabel, lowestBalanceLabel } from "@/lib/balanceColor";
import { displayName } from "@/lib/displayName";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { remainingTotal, ruleEndDate } from "@/lib/engine/remaining";
import { goalProgress } from "@/lib/engine/goalProgress";
import { computeMonthlyPeaksAndDrops } from "@/lib/engine/peaksAndDrops";
import { findFirstDangerPoint, findLowestBalancePoint } from "@/lib/engine/lowestBalance";
import {
  budgetProgressFraction,
  budgetReplenishRule,
  computeBudgetBalance,
  replenishProgress,
} from "@/lib/engine/budgetLedger";
import { daysBetween } from "@/lib/engine/date-utils";
import { ProgressBar } from "@/components/ProgressBar";
import { SampleDataBanner } from "@/components/SampleDataBanner";
import { PreviewModeBar } from "@/components/PreviewModeBar";
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { DashboardWidgetsPanel, type DashboardWidget } from "@/components/DashboardWidgetsPanel";
import { PeaksAndDropsCard } from "./PeaksAndDropsCard";
import { getSampleFixtureData } from "@/lib/sampleFixture";
import type { RecurringItem } from "@/lib/engine/types";

// T48/user follow-up: reshapes computeMonthlyPeaksAndDrops's flat "YYYY-MM"
// list into one block per year, each holding just its own present months (no
// padding for out-of-horizon months) - a wrapping card grid, not a table, so
// months reflow to the next line within their year block instead of forcing
// horizontal scroll. Purely presentational; the engine's data shape is
// untouched.
function groupPeaksAndDropsByYear(
  rows: { month: string; peak: number; drop: number }[],
): { year: number; months: { month: string; peak: number; drop: number }[] }[] {
  const byYear = new Map<number, { month: string; peak: number; drop: number }[]>();
  for (const row of rows) {
    const [year] = row.month.split("-").map(Number);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(row);
  }
  return [...byYear.entries()].sort(([a], [b]) => a - b).map(([year, months]) => ({ year, months }));
}

// T72: aggregates settled/total occurrences across every item of one type
// (debt or savings) into a single Dashboard-level progress bar - each
// item's own count comes from goalProgress.ts, summed here rather than
// re-derived, so the per-item and aggregate numbers always agree.
function aggregateGoalProgress(items: RecurringItem[], settledCountByItemId: Map<string, number>) {
  let total = 0;
  let settled = 0;
  for (const item of items) {
    const progress = goalProgress(item, settledCountByItemId.get(item.id) ?? 0);
    total += progress.total;
    settled += progress.settled;
  }
  return { total, settled, fraction: total === 0 ? 0 : settled / total };
}

function DashboardCard({
  title,
  value,
  valueClassName = "",
}: {
  title: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-notion-hairline bg-white p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className={`text-xl font-semibold text-notion-text ${valueClassName}`}>{value}</p>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // T103: opt-in preview mode (?preview=1) renders a static sample fixture
  // instead of querying Supabase at all - real financial data is never
  // touched. Auth still runs normally (just the greeting), but the
  // settled-counts query below is skipped entirely in preview, same as the
  // fixture's own settled counts (there's nothing to settle against - see
  // sampleFixture.ts).
  const preview = (await searchParams).preview === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const settledCountByItemId = new Map<string, number>();
  let forecastData;
  let hasExtras = false;
  if (preview) {
    forecastData = getSampleFixtureData();
    // Skipped in preview - the fixture's items have nothing to settle
    // against, so every progress bar just reads "0 of N".
  } else {
    const [data, settlementsRes, oneOffsRes] = await Promise.all([
      loadForecast(),
      // T72: settled counts for the Debt/Savings aggregate progress bars
      // below - not part of loadForecast()'s own data, so fetched separately.
      supabase.from("settlements").select("source_id, type").in("type", ["debt", "savings"]),
      // T99: "has the user logged any extras yet" for the Getting Started
      // checklist - loadForecast() only feeds one-offs into the engine
      // internally, it doesn't return them, and a count-only head request is
      // cheaper than fetching full rows just to check `.length > 0`.
      supabase.from("one_off_items").select("id", { count: "exact", head: true }),
    ]);
    forecastData = data;
    for (const row of settlementsRes.data ?? []) {
      settledCountByItemId.set(row.source_id, (settledCountByItemId.get(row.source_id) ?? 0) + 1);
    }
    hasExtras = (oneOffsRes.count ?? 0) > 0;
  }
  const {
    forecast,
    balances,
    recurringItems,
    budgets,
    budgetEntries,
    currency,
    balanceRanges,
    tierLabels,
    sampleDataSeededAt,
    today,
    horizon,
  } = forecastData;

  const profileName = (user?.user_metadata?.name as string | undefined) ?? "";
  const greetingName = displayName(profileName, user?.email);

  // T99: Getting Started checklist - each row is derived live from whether
  // the account currently has any row in that category, not a separately
  // persisted "completed" flag (see SPEC.md T99 for why - no new DB state
  // needed, and it "just works" the moment real data appears, the same way
  // it would go blank again after a Reset).
  const hasAccounts = balances.length > 0;
  const hasBills = recurringItems.some((item) => item.type === "bill");
  const hasIncome = recurringItems.some((item) => item.type === "income");
  const hasDebtOrSavings = recurringItems.some((item) => item.type === "debt" || item.type === "savings");
  const hasBudgets = budgets.length > 0;

  // T125: a brand-new account has nothing to forecast, but every
  // forecast-derived stat still computed happily against zero and produced
  // confident-looking output - most damagingly the Lowest Balance Ahead
  // card, which read "Goes negative by ₱0.00" because ₱0 falls in the danger
  // tier (`balance_ranges[0]` defaults to 0). The app's first impression was
  // an alarm about money nobody had entered. These cards now show a real
  // empty state instead of a number derived from nothing.
  const hasAnyFinancialData =
    balances.length > 0 || recurringItems.length > 0 || budgets.length > 0 || forecast.length > 0;

  const totalBalance = balances.reduce((sum, balance) => sum + balance.amount, 0);

  const totalMonthlyBills = recurringItems
    .filter((item) => item.type === "bill")
    .reduce((sum, item) => sum + Math.abs(monthlyEquivalent(item)), 0);

  const totalMonthlyIncome = recurringItems
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + monthlyEquivalent(item), 0);

  const debtItems = recurringItems.filter((item) => item.type === "debt");
  // "never"-ending debt items have no finite remaining total or end date
  // (SPEC.md); remainingTotal/ruleEndDate return null for them, and they're
  // excluded here the same way MonthlyGoalsClient excludes them from its
  // own totals (a household with an intentionally-indefinite "debt" isn't
  // ever fully debt-free, but that one item shouldn't block the stat for
  // every other debt that does have a real end).
  const remainingDebt = debtItems.reduce(
    (sum, item) => sum + (remainingTotal(item, today) ?? 0),
    0,
  );
  const debtEndDates = debtItems
    .map((item) => ruleEndDate(item))
    .filter((date): date is string => date !== null);
  const debtFreeDate =
    debtEndDates.length > 0 ? debtEndDates.reduce((latest, date) => (date > latest ? date : latest)) : null;
  const daysUntilDebtFree = debtFreeDate ? daysBetween(today, debtFreeDate) : null;
  // T72: debt items always have a finite end (DB-enforced), so an aggregate
  // settled/total progress bar is always computable - no null-filtering
  // needed here, unlike remainingDebt/debtFreeDate above (which still guard
  // against other recurring types' "never" rule, not debt's own).
  const debtProgress = aggregateGoalProgress(debtItems, settledCountByItemId);

  const savingsItems = recurringItems.filter((item) => item.type === "savings");
  const remainingSavings = savingsItems.reduce(
    (sum, item) => sum + (remainingTotal(item, today) ?? 0),
    0,
  );
  const savingsEndDates = savingsItems
    .map((item) => ruleEndDate(item))
    .filter((date): date is string => date !== null);
  const savingsGoalDate =
    savingsEndDates.length > 0 ? savingsEndDates.reduce((latest, date) => (date > latest ? date : latest)) : null;
  const daysUntilSavingsGoal = savingsGoalDate ? daysBetween(today, savingsGoalDate) : null;
  const savingsProgress = aggregateGoalProgress(savingsItems, settledCountByItemId);

  const peaksAndDrops = computeMonthlyPeaksAndDrops(forecast, totalBalance, today, horizon);
  const peaksAndDropsByYear = groupPeaksAndDropsByYear(peaksAndDrops);
  const lowestBalance = findLowestBalancePoint(forecast, totalBalance, today);
  const firstDanger = findFirstDangerPoint(forecast, totalBalance, balanceRanges[0], today);

  // T117: every widget T117's spec lists (stat cards, Lowest Balance Ahead,
  // Peaks and Drops, Accounts, Remaining Debt, Savings, Budgets), handed to
  // `DashboardWidgetsPanel` as pre-rendered nodes rather than the page
  // rendering them inline - the panel owns order/visibility, this component
  // still owns every query and computation behind them, unchanged.
  const widgets: DashboardWidget[] = [
    {
      key: "stats",
      label: "Stat cards",
      node: (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3" data-tour="dashboard-stats">
          <DashboardCard title="Total Balance" value={formatCentavos(totalBalance, currency)} />
          <DashboardCard
            title="Total Monthly Bills"
            value={formatCentavos(totalMonthlyBills, currency)}
          />
          <DashboardCard
            title="Total Monthly Income"
            value={formatCentavos(totalMonthlyIncome, currency)}
            valueClassName="text-green-700"
          />
        </div>
      ),
    },
    {
      key: "lowestBalance",
      label: "Lowest Balance Ahead",
      node: (
        <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4" data-tour="dashboard-lowest-balance">
          <h2 className="mb-2 text-sm font-semibold text-notion-text">Lowest Balance Ahead</h2>
          {!hasAnyFinancialData ? (
            <p className="text-sm text-slate-500">
              Nothing to forecast yet. Add an account and a bill or two, and this will show the
              lowest your balance gets, and when.
            </p>
          ) : (
            <>
              {/* T76: color + wording now reflect the actual balance_ranges
                  risk tier (danger/low/medium/high/higher/highest), not a
                  hardcoded <=0 check - matches the Forecast table (T62) and
                  Peaks and Drops (T67). Danger shows the deficit magnitude
                  ("Goes negative by"); every other tier shows the (positive)
                  balance directly. */}
              <p className="text-lg font-semibold text-notion-text">
                {lowestBalanceLabel(lowestBalance.balance, balanceRanges, tierLabels)}{" "}
                <span
                  className={`inline-block rounded px-1.5 py-0.5 ${balanceRangeColorClass(lowestBalance.balance, balanceRanges)}`}
                >
                  {formatCentavos(
                    balanceRangeTier(lowestBalance.balance, balanceRanges) === "danger"
                      ? Math.abs(lowestBalance.balance)
                      : lowestBalance.balance,
                    currency,
                  )}
                </span>
              </p>
              <p className="mt-1 text-sm text-slate-500">On {formatFullDate(lowestBalance.date)}</p>
              {/* User feedback 2026-07-25: the worst point (above) can land
                  well after the balance first crosses into trouble - only
                  shown when it adds new information (a real earlier date). */}
              {firstDanger && firstDanger.date !== lowestBalance.date && (
                <div className="mt-4">
                  <p className="text-lg font-semibold text-notion-text">
                    {firstDangerLabel(firstDanger.balance)}{" "}
                    <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 text-white">
                      {formatCentavos(Math.abs(firstDanger.balance), currency)}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-slate-500">On {formatFullDate(firstDanger.date)}</p>
                </div>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      key: "peaksDrops",
      label: "Peaks and Drops",
      node: (
        <PeaksAndDropsCard
          peaksAndDropsByYear={peaksAndDropsByYear}
          balanceRanges={balanceRanges}
          currency={currency}
          hasAnyFinancialData={hasAnyFinancialData}
        />
      ),
    },
    {
      key: "accounts",
      label: "Accounts",
      node: (
        <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4" data-tour="dashboard-accounts">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-notion-text">Accounts</h2>
            <Link
              href="/accounts"
              className="rounded border border-notion-hairline px-2 py-1 text-xs text-notion-text hover:bg-notion-hover"
            >
              Manage
            </Link>
          </div>
          {balances.length === 0 ? (
            <p className="text-sm text-slate-400">No accounts yet.</p>
          ) : (
            <ul className="divide-y divide-notion-hairline text-sm">
              {balances.map((balance) => (
                <li key={balance.id} className="flex justify-between py-1.5 text-notion-text first:pt-0 last:pb-0">
                  <span>{balance.name}</span>
                  <span>{formatCentavos(balance.amount, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
    {
      key: "debt",
      label: "Remaining Debt",
      node: (
        <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-notion-text">Remaining Debt</h2>
            <Link
              href="/debt"
              className="rounded border border-notion-hairline px-2 py-1 text-xs text-notion-text hover:bg-notion-hover"
            >
              Manage
            </Link>
          </div>
          <p className="text-xl font-semibold text-orange-700">
            {formatCentavos(remainingDebt, currency)}
          </p>
          {debtFreeDate && daysUntilDebtFree !== null ? (
            <p className="mt-1 text-sm text-slate-500">
              {daysUntilDebtFree <= 0
                ? "You're debt-free!"
                : `Debt-free by ${formatFullDate(debtFreeDate)} (${daysUntilDebtFree} days)`}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">No debt tracked.</p>
          )}
          {/* T72: settled/total payments across every debt item. */}
          {debtItems.length > 0 && (
            <div className="mt-2">
              <ProgressBar percent={debtProgress.fraction * 100} over={false} />
              <p className="mt-0.5 text-xs text-slate-400">
                {debtProgress.settled} of {debtProgress.total} payments settled
              </p>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "savings",
      label: "Savings",
      node: (
        <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-notion-text">Savings</h2>
            <Link
              href="/savings"
              className="rounded border border-notion-hairline px-2 py-1 text-xs text-notion-text hover:bg-notion-hover"
            >
              Manage
            </Link>
          </div>
          <p className="text-xl font-semibold text-blue-700">
            {formatCentavos(remainingSavings, currency)}
          </p>
          {savingsGoalDate && daysUntilSavingsGoal !== null ? (
            <p className="mt-1 text-sm text-slate-500">
              {daysUntilSavingsGoal <= 0
                ? "Savings goals reached!"
                : `Goal by ${formatFullDate(savingsGoalDate)} (${daysUntilSavingsGoal} days)`}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">No savings goals tracked.</p>
          )}
          {/* T72: settled/total contributions across every savings item. */}
          {savingsItems.length > 0 && (
            <div className="mt-2">
              <ProgressBar percent={savingsProgress.fraction * 100} over={false} />
              <p className="mt-0.5 text-xs text-slate-400">
                {savingsProgress.settled} of {savingsProgress.total} contributions settled
              </p>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "budgets",
      label: "Budgets",
      node: (
        <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-notion-text">Budgets</h2>
            <Link
              href="/budgets"
              className="rounded border border-notion-hairline px-2 py-1 text-xs text-notion-text hover:bg-notion-hover"
            >
              Manage
            </Link>
          </div>
          {budgets.length === 0 ? (
            <p className="text-sm text-slate-400">No budgets yet.</p>
          ) : (
            <ul className="space-y-2">
              {budgets.map((budget) => {
                const balance = computeBudgetBalance(budgetEntries, budget.id, today);
                // Phase 11 (T60): "days until replenish", for any budget
                // with a resolvable schedule - its own ("replenish every")
                // or its linked income's. A manual budget has neither, so
                // replenishProgress returns all-null and no countdown text
                // renders.
                const linkedIncome = budget.linkedIncomeId
                  ? recurringItems.find((item) => item.id === budget.linkedIncomeId) ?? null
                  : null;
                const rule = budgetReplenishRule(budget, linkedIncome);
                const progress = replenishProgress(rule, today);
                // User follow-up (2026-07-24): the bar itself is
                // money-based, not time-based - see budgetProgressFraction.
                // Renders for manual budgets too now, not just scheduled
                // ones.
                const barFraction = budgetProgressFraction({
                  allocation: budget.allocation,
                  remaining: balance,
                  previousDate: progress.previousDate,
                  nextDate: progress.nextDate,
                  asOf: today,
                });

                return (
                  <li key={budget.id} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-notion-text">{budget.name}</span>
                      <span className={balance < 0 ? "font-medium text-red-600" : "text-slate-500"}>
                        {formatCentavos(balance, currency)}
                      </span>
                    </div>
                    {barFraction !== null && (
                      <div className="mt-1">
                        <ProgressBar percent={barFraction * 100} over={false} />
                        {progress.daysUntil !== null && (
                          <p className="mt-0.5 text-xs text-slate-400">
                            {progress.daysUntil <= 0
                              ? "Replenishes today"
                              : `${progress.daysUntil} day${progress.daysUntil === 1 ? "" : "s"} until replenish`}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex min-h-full flex-col">
      {preview && <PreviewModeBar />}
      <DashboardWidgetsPanel widgets={widgets}>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-notion-text">Dashboard</h1>
          <p className="text-slate-500">Welcome, {greetingName}</p>
        </div>

        {sampleDataSeededAt && <SampleDataBanner />}

        {/* T99: hidden in preview mode - it's not the account's real
            progress, so nothing here should nudge someone previewing sample
            data to go "finish" a checklist that isn't theirs. */}
        {!preview && (
          <GettingStartedChecklist
            hasAccounts={hasAccounts}
            hasBills={hasBills}
            hasIncome={hasIncome}
            hasDebtOrSavings={hasDebtOrSavings}
            hasBudgets={hasBudgets}
            hasExtras={hasExtras}
          />
        )}
      </DashboardWidgetsPanel>
    </div>
  );
}
