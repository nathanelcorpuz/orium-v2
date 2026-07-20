import Link from "next/link";
import { loadForecast } from "@/lib/forecastData";
import { formatCentavos } from "@/lib/money";
import { balanceRangeColorClass } from "@/lib/balanceColor";
import type { ForecastRow } from "@/lib/engine/types";

const TYPE_COLOR: Record<ForecastRow["type"], string> = {
  income: "text-green-700",
  debt: "text-orange-700",
  savings: "text-blue-700",
  extra: "text-purple-700",
  bill: "text-slate-900",
};

export default async function ForecastPage() {
  const { forecast, balances, currency, balanceRanges } = await loadForecast();

  const totalBalance = balances.reduce((sum, balance) => sum + balance.amount, 0);

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-slate-500 underline">
          &larr; Home
        </Link>

        <div className="mb-6 mt-2">
          <h1 className="text-xl font-semibold">Forecast</h1>
          <p className="text-slate-600">
            Total balance: {formatCentavos(totalBalance, currency)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {balances.map((balance) => (
              <div key={balance.id} className="rounded-full bg-white px-3 py-1 text-sm shadow">
                {balance.name}: {formatCentavos(balance.amount, currency)}
              </div>
            ))}
          </div>
        </div>

        {forecast.length === 0 ? (
          <p className="text-slate-500">No upcoming transactions yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white shadow">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="p-3">Date</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((row, index) => (
                  <tr
                    key={`${row.sourceType}-${row.sourceId}-${row.originalDate}-${index}`}
                    className={balanceRangeColorClass(row.runningBalance, balanceRanges)}
                  >
                    <td className="p-3">{row.dueDate}</td>
                    <td className="p-3">{row.name}</td>
                    <td className={`p-3 ${TYPE_COLOR[row.type]}`}>{row.type}</td>
                    <td className="p-3 text-right">{formatCentavos(row.amount, currency)}</td>
                    <td className="p-3 text-right font-medium">
                      {formatCentavos(row.runningBalance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
