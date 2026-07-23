import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { formatCentavos } from "@/lib/money";
import { formatFullDate, formatMonthYear } from "@/lib/date";
import { displayName } from "@/lib/displayName";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { remainingTotal, ruleEndDate } from "@/lib/engine/remaining";
import { computeMonthlyPeaksAndDrops } from "@/lib/engine/peaksAndDrops";
import { computeBudgetBalance } from "@/lib/engine/budgetLedger";
import { daysBetween } from "@/lib/engine/date-utils";

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
            <ul className="space-y-1">
              {budgets.map((budget) => {
                const balance = computeBudgetBalance(budgetEntries, budget.id, today);
                return (
                  <li key={budget.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-notion-text">{budget.name}</span>
                    <span className={balance < 0 ? "font-medium text-red-600" : "text-slate-500"}>
                      {formatCentavos(balance, currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-notion-hairline bg-white">
          <h2 className="p-4 pb-2 text-sm font-semibold text-notion-text">Peaks and Drops</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-notion-hairline text-left text-slate-500">
                <th className="p-3">Month</th>
                <th className="p-3 text-right">Peak</th>
                <th className="p-3 text-right">Drop</th>
              </tr>
            </thead>
            <tbody>
              {peaksAndDrops.map((row) => (
                <tr key={row.month} className="border-b border-notion-hairline text-notion-text last:border-0">
                  <td className="p-3">{formatMonthYear(row.month)}</td>
                  <td className="p-3 text-right">{formatCentavos(row.peak, currency)}</td>
                  <td className="p-3 text-right">{formatCentavos(row.drop, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
