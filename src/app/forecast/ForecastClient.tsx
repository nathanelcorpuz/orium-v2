"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCentavos } from "@/lib/money";
import { balanceRangeColorClass } from "@/lib/balanceColor";
import { BalanceModal, type BalanceRow } from "@/app/balances/BalanceModal";
import type { Budget, BudgetEntry, ForecastRow, OccurrenceOverride, RecurringItem } from "@/lib/engine/types";
import { EditSettleModal } from "./EditSettleModal";
import { RemindersPanel, type ReminderRow } from "./RemindersPanel";
import { BudgetsPanel } from "./BudgetsPanel";

const TYPE_COLOR: Record<ForecastRow["type"], string> = {
  income: "text-green-700",
  debt: "text-orange-700",
  savings: "text-blue-700",
  extra: "text-purple-700",
  bill: "text-slate-900",
  budget: "text-teal-700",
};

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

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm text-slate-500 underline">
          &larr; Home
        </Link>

        <div className="mt-2 flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="mb-6">
              <h1 className="text-xl font-semibold">Forecast</h1>
              <p className="text-slate-600">
                Total balance: {formatCentavos(totalBalance, currency)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {balances.map((balance) => (
                  <button
                    key={balance.id}
                    type="button"
                    onClick={() => setEditingBalance(balance)}
                    className="rounded-full bg-white px-3 py-1 text-sm shadow hover:bg-slate-100"
                  >
                    {balance.name}: {formatCentavos(balance.amount, currency)}
                  </button>
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
                    {forecast.map((row, index) => {
                      // Budget rows are derived, not editable/settleable
                      // (SPEC.md "Forecast integration") - logging a spend
                      // happens through the Budgets panel or page instead.
                      const clickable = row.type !== "budget";
                      return (
                        <tr
                          key={`${row.sourceType}-${row.sourceId}-${row.originalDate}-${index}`}
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
                          className={`${clickable ? "cursor-pointer hover:opacity-80" : ""} ${balanceRangeColorClass(row.runningBalance, balanceRanges)}`}
                        >
                          <td className="p-3">{row.dueDate}</td>
                          <td className="p-3">{row.name}</td>
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
    </main>
  );
}
