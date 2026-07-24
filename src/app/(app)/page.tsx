import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { formatCentavos } from "@/lib/money";
import { formatFullDate, MONTH_ABBR } from "@/lib/date";
import { displayName } from "@/lib/displayName";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { remainingTotal, ruleEndDate } from "@/lib/engine/remaining";
import { computeMonthlyPeaksAndDrops } from "@/lib/engine/peaksAndDrops";
import { findLowestBalancePoint } from "@/lib/engine/lowestBalance";
import { budgetReplenishRule, computeBudgetBalance, replenishProgress } from "@/lib/engine/budgetLedger";
import { daysBetween } from "@/lib/engine/date-utils";
import { ProgressBar } from "@/components/ProgressBar";

// T48: reshapes computeMonthlyPeaksAndDrops's flat "YYYY-MM" list into a
// year x month grid for display - one row per year, one column per calendar
// month (Jan-Dec). Purely presentational; the engine's data shape is
// untouched.
function groupPeaksAndDropsByYear(
  rows: { month: string; peak: number; drop: number }[],
): { year: number; months: ({ month: string; peak: number; drop: number } | undefined)[] }[] {
  const byYear = new Map<number, Map<number, (typeof rows)[number]>>();
  for (const row of rows) {
    const [year, month] = row.month.split("-").map(Number);
    if (!byYear.has(year)) byYear.set(year, new Map());
    byYear.get(year)!.set(month, row);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, months]) => ({
      year,
      // 12 slots (Jan-Dec), undefined where the horizon doesn't cover that
      // month - keeps positional alignment with the grid's month columns.
      months: Array.from({ length: 12 }, (_, i) => months.get(i + 1)),
    }));
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

  const { forecast, balances, recurringItems, budgets, budgetEntries, currency, today, horizon } =
    await loadForecast();

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
          <h2 className="mb-2 text-sm font-semibold text-notion-text">Balances</h2>
          {balances.length === 0 ? (
            <p className="text-sm text-slate-400">No balances yet.</p>
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
        </div>

        <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-notion-text">Budgets</h2>
          {budgets.length === 0 ? (
            <p className="text-sm text-slate-400">No budgets yet.</p>
          ) : (
            <ul className="space-y-2">
              {budgets.map((budget) => {
                const balance = computeBudgetBalance(budgetEntries, budget.id, today);
                // Phase 11 (T60): "days until replenish" + a time-based
                // progress bar, for any budget with a resolvable schedule -
                // its own ("replenish every") or its linked income's. A
                // manual budget has neither, so replenishProgress returns
                // all-null and nothing extra renders.
                const linkedIncome = budget.linkedIncomeId
                  ? recurringItems.find((item) => item.id === budget.linkedIncomeId) ?? null
                  : null;
                const rule = budgetReplenishRule(budget, linkedIncome);
                const progress = replenishProgress(rule, today);

                return (
                  <li key={budget.id} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-notion-text">{budget.name}</span>
                      <span className={balance < 0 ? "font-medium text-red-600" : "text-slate-500"}>
                        {formatCentavos(balance, currency)}
                      </span>
                    </div>
                    {progress.daysUntil !== null && (
                      <div className="mt-1">
                        <ProgressBar percent={(progress.fraction ?? 0) * 100} over={false} />
                        <p className="mt-0.5 text-xs text-slate-400">
                          {progress.daysUntil <= 0
                            ? "Replenishes today"
                            : `${progress.daysUntil} day${progress.daysUntil === 1 ? "" : "s"} until replenish`}
                        </p>
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
          <div className="max-h-64 overflow-auto md:max-h-[420px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-notion-hairline text-left text-slate-500">
                  <th className="sticky top-0 z-10 bg-white p-3">Year</th>
                  {MONTH_ABBR.map((label) => (
                    <th key={label} className="sticky top-0 z-10 min-w-[104px] bg-white p-3 text-right">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {peaksAndDropsByYear.map(({ year, months }) => (
                  <tr key={year} className="border-b border-notion-hairline text-notion-text last:border-0">
                    <td className="p-3 font-medium">{year}</td>
                    {months.map((entry, i) =>
                      entry ? (
                        <td key={i} className="p-3 text-right">
                          <p className="text-xs text-slate-400">
                            {MONTH_ABBR[i]} {year}
                          </p>
                          <p>{formatCentavos(entry.peak, currency)}</p>
                          <p className="text-slate-500">{formatCentavos(entry.drop, currency)}</p>
                        </td>
                      ) : (
                        <td key={i} className="p-3 text-right text-slate-300">
                          —
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
