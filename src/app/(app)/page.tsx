import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { formatCentavos } from "@/lib/money";
import { formatFullDate, formatMonthYear } from "@/lib/date";
import { balanceRangeColorClass } from "@/lib/balanceColor";
import { displayName } from "@/lib/displayName";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { remainingTotal, ruleEndDate } from "@/lib/engine/remaining";
import { goalProgress } from "@/lib/engine/goalProgress";
import { computeMonthlyPeaksAndDrops } from "@/lib/engine/peaksAndDrops";
import { findLowestBalancePoint } from "@/lib/engine/lowestBalance";
import {
  budgetProgressFraction,
  budgetReplenishRule,
  computeBudgetBalance,
  replenishProgress,
} from "@/lib/engine/budgetLedger";
import { daysBetween } from "@/lib/engine/date-utils";
import { ProgressBar } from "@/components/ProgressBar";
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

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ forecast, balances, recurringItems, budgets, budgetEntries, currency, balanceRanges, today, horizon }, settlementsRes] =
    await Promise.all([
      loadForecast(),
      // T72: settled counts for the Debt/Savings aggregate progress bars
      // below - not part of loadForecast()'s own data, so fetched separately.
      supabase.from("settlements").select("source_id, type").in("type", ["debt", "savings"]),
    ]);
  const settledCountByItemId = new Map<string, number>();
  for (const row of settlementsRes.data ?? []) {
    settledCountByItemId.set(row.source_id, (settledCountByItemId.get(row.source_id) ?? 0) + 1);
  }

  const profileName = (user?.user_metadata?.name as string | undefined) ?? "";
  const greetingName = displayName(profileName, user?.email);

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

  return (
    <div className="p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-notion-text">Dashboard</h1>
          <p className="text-slate-500">Welcome, {greetingName}</p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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

        <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-notion-text">Accounts</h2>
          {balances.length === 0 ? (
            <p className="text-sm text-slate-400">No accounts yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {balances.map((balance) => (
                <li key={balance.id} className="flex justify-between text-notion-text">
                  <span>{balance.name}</span>
                  <span>{formatCentavos(balance.amount, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-notion-text">Remaining Debt</h2>
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

        <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-notion-text">Savings</h2>
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

        <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-notion-text">Budgets</h2>
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

        <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-notion-text">Lowest Balance Ahead</h2>
          {lowestBalance.balance <= 0 ? (
            <p className="text-xl font-semibold text-red-700">
              ⚠ Goes negative by {formatCentavos(Math.abs(lowestBalance.balance), currency)}
            </p>
          ) : (
            <p className="text-xl font-semibold text-notion-text">
              {formatCentavos(lowestBalance.balance, currency)}
            </p>
          )}
          <p className="mt-1 text-sm text-slate-500">On {formatFullDate(lowestBalance.date)}</p>
        </div>

        <div className="rounded-lg border border-notion-hairline bg-white">
          <h2 className="p-4 pb-2 text-sm font-semibold text-notion-text">Peaks and Drops</h2>
          <div className="max-h-64 space-y-4 overflow-y-auto p-4 pt-2 md:max-h-[420px]">
            {peaksAndDropsByYear.map(({ year, months }) => (
              <div key={year}>
                <p className="mb-2 text-sm font-medium text-notion-text">{year}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {months.map((entry) => (
                    <div
                      key={entry.month}
                      className="rounded border border-notion-hairline p-2 text-right text-xs"
                    >
                      <p className="mb-1 text-slate-400">{formatMonthYear(entry.month)}</p>
                      <p>
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 ${balanceRangeColorClass(entry.peak, balanceRanges)}`}
                        >
                          {formatCentavos(entry.peak, currency)}
                        </span>
                      </p>
                      <p className="mt-1">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 ${balanceRangeColorClass(entry.drop, balanceRanges)}`}
                        >
                          {formatCentavos(entry.drop, currency)}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
