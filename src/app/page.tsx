import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import { loadForecast } from "@/lib/forecastData";
import { formatCentavos } from "@/lib/money";
import { displayName } from "@/lib/displayName";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { remainingTotal, ruleEndDate } from "@/lib/engine/remaining";
import { computeMonthlyPeaksAndDrops } from "@/lib/engine/peaksAndDrops";
import { computeBudgetCycleStatus } from "@/lib/engine/budgetCycles";
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
    <div className="rounded-xl bg-white p-4 shadow">
      <p className="text-sm text-slate-500">{title}</p>
      <p className={`text-xl font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { forecast, balances, recurringItems, overrides, budgets, budgetEntries, currency, today, horizon } =
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
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Dashboard</h1>
            <p className="text-slate-600">Welcome, {greetingName}</p>
          </div>
          <form action={logout}>
            <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
              Log out
            </button>
          </form>
        </div>

        <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/balances" className="underline">
            Balances
          </Link>
          <Link href="/bills" className="underline">
            Bills
          </Link>
          <Link href="/income" className="underline">
            Income
          </Link>
          <Link href="/debt" className="underline">
            Debt
          </Link>
          <Link href="/savings" className="underline">
            Savings
          </Link>
          <Link href="/budgets" className="underline">
            Budgets
          </Link>
          <Link href="/extra" className="underline">
            Extras
          </Link>
          <Link href="/forecast" className="underline">
            Forecast
          </Link>
          <Link href="/history" className="underline">
            History
          </Link>
          <Link href="/settings" className="underline">
            Settings
          </Link>
        </nav>

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

        <div className="mb-6 rounded-xl bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Balances</h2>
          {balances.length === 0 ? (
            <p className="text-sm text-slate-400">No balances yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {balances.map((balance) => (
                <li key={balance.id} className="flex justify-between">
                  <span>{balance.name}</span>
                  <span>{formatCentavos(balance.amount, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mb-6 rounded-xl bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Remaining Debt</h2>
          <p className="text-xl font-semibold text-orange-700">
            {formatCentavos(remainingDebt, currency)}
          </p>
          {debtFreeDate && daysUntilDebtFree !== null ? (
            <p className="mt-1 text-sm text-slate-600">
              {daysUntilDebtFree <= 0
                ? "You're debt-free!"
                : `Debt-free by ${debtFreeDate} (${daysUntilDebtFree} days)`}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">No debt tracked.</p>
          )}
        </div>

        <div className="mb-6 rounded-xl bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Budgets this cycle</h2>
          {budgets.length === 0 ? (
            <p className="text-sm text-slate-400">No budgets yet.</p>
          ) : (
            <ul className="space-y-2">
              {budgets.map((budget) => {
                const entries = budgetEntries.filter((entry) => entry.budgetId === budget.id);
                const status = computeBudgetCycleStatus(budget, entries, recurringItems, overrides, today);
                const available = status.allocation + status.carriedIn;
                const progressPercent =
                  available > 0 ? Math.min((status.spent / available) * 100, 100) : status.spent > 0 ? 100 : 0;

                return (
                  <li key={budget.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{budget.name}</span>
                      <span className={status.over > 0 ? "font-medium text-red-600" : "text-slate-500"}>
                        {status.over > 0
                          ? `Over by ${formatCentavos(status.over, currency)}`
                          : `${formatCentavos(status.remaining, currency)} left`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full ${status.over > 0 ? "bg-red-500" : "bg-teal-600"}`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl bg-white shadow">
          <h2 className="p-4 pb-2 text-sm font-semibold text-slate-700">Peaks and Drops</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="p-3">Month</th>
                <th className="p-3 text-right">Peak</th>
                <th className="p-3 text-right">Drop</th>
              </tr>
            </thead>
            <tbody>
              {peaksAndDrops.map((row) => (
                <tr key={row.month} className="border-b border-slate-100 last:border-0">
                  <td className="p-3">{row.month}</td>
                  <td className="p-3 text-right">{formatCentavos(row.peak, currency)}</td>
                  <td className="p-3 text-right">{formatCentavos(row.drop, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
