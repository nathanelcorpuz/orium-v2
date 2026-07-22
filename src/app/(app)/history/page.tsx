import { createClient } from "@/lib/supabase/server";
import { formatCentavos } from "@/lib/money";

const TYPE_COLOR: Record<string, string> = {
  income: "text-green-700",
  debt: "text-orange-700",
  savings: "text-blue-700",
  extra: "text-purple-700",
  bill: "text-slate-900",
  budget: "text-teal-700",
};

export default async function HistoryPage() {
  const supabase = await createClient();

  const [settlementsRes, preferencesRes] = await Promise.all([
    supabase
      .from("settlements")
      .select(
        "id, name, type, forecasted_amount, actual_amount, forecasted_date, actual_date, forecasted_balance",
      )
      .order("actual_date", { ascending: false }),
    supabase.from("preferences").select("currency").single(),
  ]);

  if (settlementsRes.error) {
    return <p className="p-8 text-red-600">Could not load history: {settlementsRes.error.message}</p>;
  }

  const rows = settlementsRes.data ?? [];
  const currency = preferencesRes.data?.currency ?? "₱";

  return (
    <div className="p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-xl font-semibold">History</h1>

        {rows.length === 0 ? (
          <p className="text-slate-500">No settled transactions yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white shadow">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="p-3">Name</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">Forecasted</th>
                  <th className="p-3 text-right">Actual</th>
                  <th className="p-3">Forecasted date</th>
                  <th className="p-3">Actual date</th>
                  <th className="p-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  // Budget settlements have no real forecast to compare
                  // against - forecasted_amount/forecasted_balance are 0 and
                  // forecasted_date mirrors actual_date (SPEC.md "Logging a
                  // spend"), so showing them as real numbers would be
                  // misleading rather than just absent.
                  const isBudget = row.type === "budget";
                  return (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="p-3">{row.name}</td>
                      <td className="p-3">
                        {isBudget ? (
                          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                            budget
                          </span>
                        ) : (
                          <span className={TYPE_COLOR[row.type] ?? ""}>{row.type}</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {isBudget ? "—" : formatCentavos(row.forecasted_amount, currency)}
                      </td>
                      <td className="p-3 text-right">{formatCentavos(row.actual_amount, currency)}</td>
                      <td className="p-3">{isBudget ? "—" : row.forecasted_date}</td>
                      <td className="p-3">{row.actual_date}</td>
                      <td className="p-3 text-right font-medium">
                        {isBudget ? "—" : formatCentavos(row.forecasted_balance, currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
