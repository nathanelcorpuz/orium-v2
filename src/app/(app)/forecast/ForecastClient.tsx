"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import { balanceRangeColorClass } from "@/lib/balanceColor";
import { BalanceModal, type BalanceRow } from "@/app/(app)/balances/BalanceModal";
import { AmountRangeFilter, matchesAmountFilter, type ComparisonOp } from "@/components/AmountRangeFilter";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import type { ForecastRow } from "@/lib/engine/types";
import type { LowestBalancePoint } from "@/lib/engine/lowestBalance";
import { EditSettleModal } from "./EditSettleModal";
import { RemindersPanel, type ReminderRow } from "./RemindersPanel";

// T49: the forecast list can grow into the hundreds of rows across a 3-year
// horizon with weekly/daily items - loadForecast() already fetches the full
// list server-side in one shot, so this is purely client-side incremental
// *rendering* of already-fetched data (batches revealed as the user scrolls
// near the bottom), not new pagination plumbing.
const INITIAL_VISIBLE_ROWS = 50;
const ROWS_PER_BATCH = 50;

const TYPE_COLOR: Record<ForecastRow["type"], string> = {
  income: "text-green-700",
  debt: "text-orange-700",
  savings: "text-blue-700",
  extra: "text-purple-700",
  bill: "text-notion-text",
  budget: "text-notion-budget",
};

const TYPE_OPTIONS: { value: ForecastRow["type"]; label: string }[] = [
  { value: "income", label: "Income" },
  { value: "bill", label: "Bill" },
  { value: "debt", label: "Debt" },
  { value: "savings", label: "Savings" },
  { value: "extra", label: "Extra" },
  { value: "budget", label: "Budget" },
];

export function ForecastClient({
  forecast,
  balances,
  currency,
  balanceRanges,
  reminders,
  lowestBalance,
}: {
  forecast: ForecastRow[];
  balances: BalanceRow[];
  currency: string;
  balanceRanges: number[];
  reminders: ReminderRow[];
  lowestBalance: LowestBalancePoint;
}) {
  const [editingBalance, setEditingBalance] = useState<BalanceRow | null>(null);
  const [selectedRow, setSelectedRow] = useState<ForecastRow | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  // T50: Forecast table filter bar - all client-side, filtering the
  // already-loaded `forecast` array before it feeds into T49's incremental
  // rendering below. No new server round-trip.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<ForecastRow["type"]>>(new Set());
  const [amountOp, setAmountOp] = useState<ComparisonOp>("any");
  const [amountValue1, setAmountValue1] = useState("");
  const [amountValue2, setAmountValue2] = useState("");
  const [balanceOp, setBalanceOp] = useState<ComparisonOp>("any");
  const [balanceValue1, setBalanceValue1] = useState("");
  const [balanceValue2, setBalanceValue2] = useState("");

  function toggleType(type: ForecastRow["type"]) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setNameFilter("");
    setSelectedTypes(new Set());
    setAmountOp("any");
    setAmountValue1("");
    setAmountValue2("");
    setBalanceOp("any");
    setBalanceValue1("");
    setBalanceValue2("");
  }

  const filtersActive =
    dateFrom !== "" ||
    dateTo !== "" ||
    nameFilter !== "" ||
    selectedTypes.size > 0 ||
    amountOp !== "any" ||
    balanceOp !== "any";

  const filteredForecast = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    return forecast.filter((row) => {
      if (dateFrom && row.dueDate < dateFrom) return false;
      if (dateTo && row.dueDate > dateTo) return false;
      if (name && !row.name.toLowerCase().includes(name)) return false;
      if (selectedTypes.size > 0 && !selectedTypes.has(row.type)) return false;
      if (!matchesAmountFilter(row.amount, amountOp, amountValue1, amountValue2)) return false;
      if (!matchesAmountFilter(row.runningBalance, balanceOp, balanceValue1, balanceValue2)) return false;
      return true;
    });
  }, [
    forecast,
    dateFrom,
    dateTo,
    nameFilter,
    selectedTypes,
    amountOp,
    amountValue1,
    amountValue2,
    balanceOp,
    balanceValue1,
    balanceValue2,
  ]);

  // Reset to the first batch whenever the filters themselves change, so a
  // narrowed result set always starts fresh rather than instantly rendering
  // however many rows happened to be revealed before the filter was applied.
  // Adjusted during render (React's documented pattern for "reset state when
  // a computed value changes") rather than in an effect, which would cause
  // an extra render pass for no benefit here.
  const filterKey = JSON.stringify([
    dateFrom,
    dateTo,
    nameFilter,
    [...selectedTypes].sort(),
    amountOp,
    amountValue1,
    amountValue2,
    balanceOp,
    balanceValue1,
    balanceValue2,
  ]);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(INITIAL_VISIBLE_ROWS);
  }

  const totalBalance = balances.reduce((sum, balance) => sum + balance.amount, 0);
  const visibleForecast = filteredForecast.slice(0, visibleCount);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => Math.min(count + ROWS_PER_BATCH, filteredForecast.length));
        }
      },
      { root, rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredForecast.length]);

  return (
    <div className="flex min-h-full">
      <div className="min-w-0 flex-1 p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-notion-text">Forecast</h1>
            <p className="text-slate-500">
              Total balance: {formatCentavos(totalBalance, currency)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {balances.map((balance) => (
                <button
                  key={balance.id}
                  type="button"
                  onClick={() => setEditingBalance(balance)}
                  className="rounded-full border border-notion-hairline bg-white px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                >
                  {balance.name}: {formatCentavos(balance.amount, currency)}
                </button>
              ))}
            </div>
            <p className={`mt-2 text-sm ${lowestBalance.balance <= 0 ? "font-medium text-red-600" : "text-slate-500"}`}>
              {lowestBalance.balance <= 0
                ? `⚠ Goes negative by ${formatCentavos(Math.abs(lowestBalance.balance), currency)} on ${formatFullDate(lowestBalance.date)}`
                : `Lowest balance ahead: ${formatCentavos(lowestBalance.balance, currency)} on ${formatFullDate(lowestBalance.date)}`}
            </p>
          </div>

          {forecast.length > 0 && (
            <div className="mb-4 rounded-lg border border-notion-hairline bg-white p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="rounded border border-notion-hairline px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="rounded border border-notion-hairline px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
                  />
                </div>
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
                <AmountRangeFilter
                  label="Amount"
                  op={amountOp}
                  value1={amountValue1}
                  value2={amountValue2}
                  onOpChange={setAmountOp}
                  onValue1Change={setAmountValue1}
                  onValue2Change={setAmountValue2}
                />
                <AmountRangeFilter
                  label="Balance"
                  op={balanceOp}
                  value1={balanceValue1}
                  value2={balanceValue2}
                  onOpChange={setBalanceOp}
                  onValue1Change={setBalanceValue1}
                  onValue2Change={setBalanceValue2}
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
                  Showing {filteredForecast.length} of {forecast.length} transactions
                </p>
              )}
            </div>
          )}

          {forecast.length === 0 ? (
            <p className="text-slate-500">No upcoming transactions yet.</p>
          ) : filteredForecast.length === 0 ? (
            <p className="text-slate-500">No transactions match these filters.</p>
          ) : (
            <div
              ref={scrollContainerRef}
              className="max-h-[50vh] overflow-auto rounded-lg border border-notion-hairline bg-white md:max-h-[70vh]"
            >
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-notion-hairline text-left text-slate-500">
                    <th className="sticky top-0 z-10 bg-white px-2 py-1.5">Date</th>
                    <th className="sticky top-0 z-10 bg-white px-2 py-1.5">Name</th>
                    <th className="sticky top-0 z-10 bg-white px-2 py-1.5">Type</th>
                    <th className="sticky top-0 z-10 bg-white px-2 py-1.5 text-right">Amount</th>
                    <th className="sticky top-0 z-10 bg-white px-2 py-1.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleForecast.map((row, index) => {
                    // Phase 11 (T59): an income-linked budget_replenish row
                    // settles automatically when its linked income is
                    // settled (T56's hook, extended) - it's never
                    // independently clickable, unlike an own-schedule
                    // ("replenish every") budget_replenish row, which is.
                    const isClickable = row.sourceType !== "budget_replenish" || row.budgetSettleable === true;
                    return (
                      <tr
                        key={`${row.sourceType}-${row.sourceId}-${row.originalDate}-${index}`}
                        role={isClickable ? "button" : undefined}
                        tabIndex={isClickable ? 0 : undefined}
                        onClick={isClickable ? () => setSelectedRow(row) : undefined}
                        onKeyDown={
                          isClickable
                            ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setSelectedRow(row);
                                }
                              }
                            : undefined
                        }
                        className={`border-b border-notion-hairline text-notion-text last:border-0 ${isClickable ? "cursor-pointer hover:opacity-80" : ""}`}
                      >
                        <td className="px-2 py-1.5">{formatFullDate(row.dueDate)}</td>
                        <td className="px-2 py-1.5">
                          {!isClickable ? <span className="italic text-slate-500">{row.name}</span> : row.name}
                          {row.edited && (
                            <span className="ml-1.5 text-slate-400" title="Edited from its usual schedule">
                              ✎
                            </span>
                          )}
                          {!isClickable && (
                            <span
                              className="ml-1.5 rounded-full bg-notion-hover px-1.5 py-0.5 text-xs text-slate-500"
                              title="Replenishes automatically when its linked income is settled"
                            >
                              auto
                            </span>
                          )}
                        </td>
                        <td className={`px-2 py-1.5 ${TYPE_COLOR[row.type]}`}>{row.type}</td>
                        <td className="px-2 py-1.5 text-right">{formatCentavos(row.amount, currency)}</td>
                        <td className="px-2 py-1.5 text-right font-medium">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 ${balanceRangeColorClass(row.runningBalance, balanceRanges)}`}
                          >
                            {formatCentavos(row.runningBalance, currency)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleCount < filteredForecast.length && (
                    <tr ref={sentinelRef}>
                      <td colSpan={5} className="p-2 text-center text-xs text-slate-400">
                        Loading more…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <RemindersPanel reminders={reminders} />

      {editingBalance && (
        <BalanceModal balance={editingBalance} onClose={() => setEditingBalance(null)} />
      )}

      {selectedRow && (
        <EditSettleModal
          row={selectedRow}
          currency={currency}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}
