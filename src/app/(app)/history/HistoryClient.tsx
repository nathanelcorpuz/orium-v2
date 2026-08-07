"use client";

import { useMemo, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import { DatePicker } from "@/components/DatePicker";
import { AmountRangeFilter, matchesAmountFilter, type ComparisonOp } from "@/components/AmountRangeFilter";
import { CollapsibleFilters } from "@/components/CollapsibleFilters";
import { MultiSelectChips } from "@/components/MultiSelectChips";

const TYPE_COLOR: Record<string, string> = {
  income: "text-green-700",
  debt: "text-orange-700",
  savings: "text-blue-700",
  extra: "text-purple-700",
  bill: "text-notion-text",
  budget: "text-teal-700",
};

// T106: display-only mapping - `settlements.type` stores "extra" (unchanged
// schema value), this just renders it as "misc".
const TYPE_LABEL: Record<string, string> = {
  extra: "misc",
};

const TYPE_OPTIONS = [
  { value: "bill", label: "Bill" },
  { value: "income", label: "Income" },
  { value: "debt", label: "Debt" },
  { value: "savings", label: "Savings" },
  { value: "extra", label: "Misc" },
  { value: "budget", label: "Budget" },
];

export type SettlementRow = {
  id: string;
  name: string;
  type: string;
  forecasted_amount: number;
  actual_amount: number;
  forecasted_date: string;
  actual_date: string;
  forecasted_balance: number;
  // T217/T284: which real account this settlement moved - null when the
  // underlying item/budget wasn't connected to any account. A budget
  // settlement uses this same column now too (the old separate
  // `budget_account_id` is gone - migration 0054).
  balance_id: string | null;
};

// T181: History's own filter bar - name search, type, amount range, and a
// date range on actual_date (when it really happened, not the forecast) -
// matching the pattern every other finance-record page already uses
// (T159/T178), so this was converted from a plain server component into a
// client component the same shape as Bills/Income/Misc.
export function HistoryClient({
  rows,
  currency,
  balances,
}: {
  rows: SettlementRow[];
  currency: string;
  // T217/T284: just id/name, resolved against each row's balance_id below
  // for the Account column - a budget settlement resolves against this same
  // list now too (there's no separate budget-accounts list anymore).
  balances: { id: string; name: string }[];
}) {
  function accountNameFor(row: SettlementRow): string | null {
    if (!row.balance_id) return null;
    return balances.find((balance) => balance.id === row.balance_id)?.name ?? null;
  }

  const [nameFilter, setNameFilter] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountOp, setAmountOp] = useState<ComparisonOp>("any");
  const [amountValue1, setAmountValue1] = useState("");
  const [amountValue2, setAmountValue2] = useState("");

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function clearFilters() {
    setNameFilter("");
    setSelectedTypes(new Set());
    setDateFrom("");
    setDateTo("");
    setAmountOp("any");
    setAmountValue1("");
    setAmountValue2("");
  }

  // T231: a count rather than a plain boolean, so the mobile "Filters"
  // button can badge how many are actually narrowing the list.
  const activeFilterCount =
    (nameFilter !== "" ? 1 : 0) +
    (selectedTypes.size > 0 ? 1 : 0) +
    (dateFrom !== "" ? 1 : 0) +
    (dateTo !== "" ? 1 : 0) +
    (amountOp !== "any" ? 1 : 0);
  const filtersActive = activeFilterCount > 0;

  const filteredRows = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    return rows.filter((row) => {
      if (name && !row.name.toLowerCase().includes(name)) return false;
      if (selectedTypes.size > 0 && !selectedTypes.has(row.type)) return false;
      if (dateFrom && row.actual_date < dateFrom) return false;
      if (dateTo && row.actual_date > dateTo) return false;
      if (!matchesAmountFilter(row.actual_amount, amountOp, amountValue1, amountValue2)) return false;
      return true;
    });
  }, [rows, nameFilter, selectedTypes, dateFrom, dateTo, amountOp, amountValue1, amountValue2]);

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-xl font-semibold text-notion-text">History</h1>

        {rows.length > 0 && (
          <CollapsibleFilters activeCount={activeFilterCount}>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Name</label>
                <input
                  type="text"
                  value={nameFilter}
                  onChange={(event) => setNameFilter(event.target.value)}
                  placeholder="Search name"
                  className="w-32 rounded border border-notion-hairline px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Type</label>
                <MultiSelectChips options={TYPE_OPTIONS} selected={selectedTypes} onToggle={toggleType} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Date from</label>
                <DatePicker
                  value={dateFrom}
                  onChange={setDateFrom}
                  className="rounded border border-notion-hairline px-1.5 py-1 text-left text-xs focus:border-notion-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Date to</label>
                <DatePicker
                  value={dateTo}
                  onChange={setDateTo}
                  className="rounded border border-notion-hairline px-1.5 py-1 text-left text-xs focus:border-notion-accent focus:outline-none"
                />
              </div>
              <AmountRangeFilter
                label="Amount"
                op={amountOp}
                value1={amountValue1}
                value2={amountValue2}
                onOpChange={setAmountOp}
                onValue1Change={setAmountValue1}
                onValue2Change={setAmountValue2}
              />
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded border border-notion-hairline px-2 py-1 text-xs text-slate-500 hover:bg-notion-hover"
                >
                  Clear filters
                </button>
              )}
            </div>
            {filtersActive && (
              <p className="mt-2 text-xs text-slate-400">
                Showing {filteredRows.length} of {rows.length} settlements
              </p>
            )}
          </CollapsibleFilters>
        )}

        {rows.length === 0 ? (
          <p className="text-slate-500">No settled transactions yet.</p>
        ) : filteredRows.length === 0 ? (
          <p className="text-slate-500">No settlements match these filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-notion-hairline bg-white">
            {/* T93: `min-w-full` (not `w-full`) + `whitespace-nowrap` so the
                table can grow past the container's width when it needs to. */}
            <table className="min-w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-notion-hairline text-left text-slate-500">
                  <th className="p-3">Name</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">Forecasted</th>
                  <th className="p-3 text-right">Actual</th>
                  <th className="p-3">Forecasted date</th>
                  <th className="p-3">Actual date</th>
                  <th className="p-3 text-right">Balance</th>
                  <th className="p-3">Account</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  // Most budget settlements have no real forecast to compare
                  // against - forecasted_amount/forecasted_balance are 0 and
                  // forecasted_date mirrors actual_date (SPEC.md "Logging a
                  // spend"), so showing them as real numbers would be
                  // misleading rather than just absent. Phase 11 (T59) is
                  // the one exception: settling a projected replenish
                  // occurrence (own-schedule or income-linked) writes a real,
                  // non-zero forecasted_amount/date.
                  const isBudget = row.type === "budget";
                  const budgetHasRealForecast = isBudget && row.forecasted_amount !== 0;
                  return (
                    <tr key={row.id} className="border-b border-notion-hairline text-notion-text last:border-0">
                      <td className="p-3">{row.name}</td>
                      <td className="p-3">
                        {isBudget ? (
                          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                            budget
                          </span>
                        ) : (
                          <span className={TYPE_COLOR[row.type] ?? ""}>{TYPE_LABEL[row.type] ?? row.type}</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {isBudget && !budgetHasRealForecast ? "-" : formatCentavos(row.forecasted_amount, currency)}
                      </td>
                      <td className="p-3 text-right">{formatCentavos(row.actual_amount, currency)}</td>
                      <td className="p-3">
                        {isBudget && !budgetHasRealForecast ? "-" : formatFullDate(row.forecasted_date)}
                      </td>
                      <td className="p-3">{formatFullDate(row.actual_date)}</td>
                      <td className="p-3 text-right font-medium">
                        {isBudget ? "-" : formatCentavos(row.forecasted_balance, currency)}
                      </td>
                      <td className="p-3 text-slate-500">{accountNameFor(row) ?? "-"}</td>
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
