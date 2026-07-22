"use client";

import { useState } from "react";
import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import { balanceRangeColorClass } from "@/lib/balanceColor";
import { BalanceModal, type BalanceRow } from "@/app/(app)/balances/BalanceModal";
import type { Budget, BudgetEntry, ForecastRow, OccurrenceOverride, RecurringItem } from "@/lib/engine/types";
import { EditSettleModal } from "./EditSettleModal";
import { RemindersPanel, type ReminderRow } from "./RemindersPanel";
import { BudgetsPanel } from "./BudgetsPanel";

const TYPE_COLOR: Record<ForecastRow["type"], string> = {
  income: "text-green-700",
  debt: "text-orange-700",
  savings: "text-blue-700",
  extra: "text-purple-700",
  bill: "text-notion-text",
  budget: "text-notion-budget",
};

function ReservedBadge() {
  return (
    <span className="ml-1.5 rounded-full bg-notion-hover px-1.5 py-0.5 text-[10px] font-medium not-italic text-slate-500">
      reserved
    </span>
  );
}

// A budget's cycle-boundary rows (SPEC.md T45) are a projection - "this much
// of the allocation is reserved" - not a real transaction like a bill or a
// logged spend (budget_entry rows), so they're visually distinct and, when
// several budgets reset on the same date, collapsed into one summary row
// instead of N near-identical lines. Removing them outright isn't an option:
// forecast.ts relies on them to reserve the allocation against the running
// balance, so the balance column would go stale-looking without a row to
// explain the jump.
type DisplayItem =
  | { kind: "row"; row: ForecastRow; key: string }
  | { kind: "budgetGroup"; key: string; date: string; total: number; count: number; runningBalance: number };

function buildDisplayItems(forecast: ForecastRow[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  let i = 0;
  while (i < forecast.length) {
    const row = forecast[i];
    if (row.sourceType === "budget") {
      let j = i;
      let total = 0;
      let runningBalance = row.runningBalance;
      while (j < forecast.length && forecast[j].sourceType === "budget" && forecast[j].dueDate === row.dueDate) {
        total += forecast[j].amount;
        runningBalance = forecast[j].runningBalance;
        j++;
      }
      const count = j - i;
      if (count > 1) {
        items.push({ kind: "budgetGroup", key: `budget-group-${row.dueDate}-${i}`, date: row.dueDate, total, count, runningBalance });
      } else {
        items.push({ kind: "row", row, key: `${row.sourceType}-${row.sourceId}-${row.originalDate}-${i}` });
      }
      i = j;
    } else {
      items.push({ kind: "row", row, key: `${row.sourceType}-${row.sourceId}-${row.originalDate}-${i}` });
      i++;
    }
  }
  return items;
}

export function ForecastClient({
  forecast,
  balances,
  currency,
  balanceRanges,
  recurringItems,
  overrides,
  budgets,
  budgetEntries,
  today,
  reminders,
}: {
  forecast: ForecastRow[];
  balances: BalanceRow[];
  currency: string;
  balanceRanges: number[];
  recurringItems: RecurringItem[];
  overrides: OccurrenceOverride[];
  budgets: Budget[];
  budgetEntries: BudgetEntry[];
  today: string;
  reminders: ReminderRow[];
}) {
  const [editingBalance, setEditingBalance] = useState<BalanceRow | null>(null);
  const [selectedRow, setSelectedRow] = useState<ForecastRow | null>(null);

  const totalBalance = balances.reduce((sum, balance) => sum + balance.amount, 0);
  const displayItems = buildDisplayItems(forecast);

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
            </div>

            {forecast.length === 0 ? (
              <p className="text-slate-500">No upcoming transactions yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-notion-hairline bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-notion-hairline text-left text-slate-500">
                      <th className="p-3">Date</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Type</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayItems.map((item) => {
                      if (item.kind === "budgetGroup") {
                        // Several budgets reset the same date - one summary
                        // row instead of N near-identical reservation rows
                        // (SPEC.md T45). Not clickable: editing an individual
                        // budget from here would be ambiguous, so that still
                        // happens via the sidebar panel or the Budgets page.
                        return (
                          <tr
                            key={item.key}
                            className={`border-b border-notion-hairline text-notion-text last:border-0 ${balanceRangeColorClass(item.runningBalance, balanceRanges)}`}
                          >
                            <td className="p-3">{formatFullDate(item.date)}</td>
                            <td className="p-3 italic text-slate-500">
                              Budgets reserved
                              <ReservedBadge />
                            </td>
                            <td className={`p-3 ${TYPE_COLOR.budget}`}>budget · {item.count}</td>
                            <td className="p-3 text-right">{formatCentavos(item.total, currency)}</td>
                            <td className="p-3 text-right font-medium">
                              {formatCentavos(item.runningBalance, currency)}
                            </td>
                          </tr>
                        );
                      }

                      const row = item.row;
                      // Only future budget rows are editable (SPEC.md T42
                      // part B) - the "remaining this cycle" row is always
                      // dated exactly `today` (originalDate never exceeds
                      // it), a live status snapshot rather than a discrete
                      // future transaction. Logging a spend on it happens
                      // through the Budgets panel or page instead.
                      const clickable = row.type !== "budget" || row.originalDate > today;
                      // Budget boundary rows are a reservation/projection,
                      // not a real transaction like a bill or a logged spend
                      // (budget_entry rows are real, so excluded) - SPEC.md
                      // T45.
                      const isReservation = row.sourceType === "budget";
                      return (
                        <tr
                          key={item.key}
                          role={clickable ? "button" : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          onClick={clickable ? () => setSelectedRow(row) : undefined}
                          onKeyDown={
                            clickable
                              ? (event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    setSelectedRow(row);
                                  }
                                }
                              : undefined
                          }
                          className={`border-b border-notion-hairline text-notion-text last:border-0 ${clickable ? "cursor-pointer hover:opacity-80" : ""} ${balanceRangeColorClass(row.runningBalance, balanceRanges)}`}
                        >
                          <td className="p-3">{formatFullDate(row.dueDate)}</td>
                          <td className="p-3">
                            {isReservation ? <span className="italic">{row.name}</span> : row.name}
                            {isReservation && <ReservedBadge />}
                            {row.edited && (
                              <span
                                className="ml-1.5 text-slate-400"
                                title="Edited from its usual schedule"
                              >
                                ✎
                              </span>
                            )}
                          </td>
                          <td className={`p-3 ${TYPE_COLOR[row.type]}`}>{row.type}</td>
                          <td className="p-3 text-right">{formatCentavos(row.amount, currency)}</td>
                          <td className="p-3 text-right font-medium">
                            {formatCentavos(row.runningBalance, currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex w-full shrink-0 flex-col gap-6 lg:w-72">
            <BudgetsPanel
              budgets={budgets}
              budgetEntries={budgetEntries}
              recurringItems={recurringItems}
              overrides={overrides}
              forecast={forecast}
              today={today}
              currency={currency}
            />
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
