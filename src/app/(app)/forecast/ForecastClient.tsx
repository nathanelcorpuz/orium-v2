"use client";

import { useEffect, useRef, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import { balanceRangeColorClass } from "@/lib/balanceColor";
import { BalanceModal, type BalanceRow } from "@/app/(app)/balances/BalanceModal";
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

  const totalBalance = balances.reduce((sum, balance) => sum + balance.amount, 0);
  const visibleForecast = forecast.slice(0, visibleCount);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => Math.min(count + ROWS_PER_BATCH, forecast.length));
        }
      },
      { root, rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [forecast.length]);

  return (
    <div className="p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
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

            {forecast.length === 0 ? (
              <p className="text-slate-500">No upcoming transactions yet.</p>
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
                              <span
                                className="ml-1.5 text-slate-400"
                                title="Edited from its usual schedule"
                              >
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
                    {visibleCount < forecast.length && (
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

          <div className="flex w-full shrink-0 flex-col gap-6 lg:w-72">
            <RemindersPanel reminders={reminders} />
          </div>
        </div>
      </div>

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
