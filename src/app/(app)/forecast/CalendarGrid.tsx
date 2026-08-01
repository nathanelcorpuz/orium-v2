"use client";

import { useMemo, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { formatFullDate, formatMonthYear, todayInManila } from "@/lib/date";
import { daysInMonth, formatDate } from "@/lib/engine/date-utils";
import { accountBalanceForRow, computeAccountBalancesAfterEachRow } from "@/lib/engine/accountBalances";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/forecastLabels";
import { summarizeRecurrence, budgetReplenishRuleSummary } from "@/lib/recurrenceSummary";
import { ChevronIcon } from "@/components/navIcons";
import { Modal } from "@/components/Modal";
import { EditSettleModal } from "./EditSettleModal";
import type { ForecastRow, Budget, IncomeAutoMove, RecurringItem } from "@/lib/engine/types";
import type { BalanceRow } from "@/app/(app)/accounts/BalanceModal";
import type { ReminderRow } from "./RemindersPanel";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function addMonths(monthStr: string, delta: number): string {
  const [year, month] = monthStr.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

// T190: the Forecast page's own Table/Calendar toggle. Used to be a separate
// /calendar page (T164) - folded in here per user request ("calendar should
// be a toggle view in the forecast table, not a separate page on its own").
// Reminders already have their own persistent panel next to this page
// (RemindersPanel), so unlike the old CalendarClient this component doesn't
// render a second reminders list - it only plots a green dot on any day that
// has a reminder due, closing the other half of the same request
// ("reminders should have an optional date that when set will show up in
// the calendar with green icon").
export function CalendarGrid({
  forecast,
  balances,
  recurringItems,
  budgets,
  currency,
  reminders,
  previewMode = false,
  incomeAutoMoves = [],
}: {
  forecast: ForecastRow[];
  balances: BalanceRow[];
  // T199: same frequency lookup ForecastClient's table uses.
  recurringItems: RecurringItem[];
  budgets: Budget[];
  currency: string;
  reminders: ReminderRow[];
  previewMode?: boolean;
  // T212 follow-up: same "tag on the income's own row" resolution
  // ForecastClient.tsx uses, threaded here too since the Calendar view is
  // an independent render of the same rows.
  incomeAutoMoves?: IncomeAutoMove[];
}) {
  const today = todayInManila();
  const [viewMonth, setViewMonth] = useState(() => monthKey(today));
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<ForecastRow | null>(null);
  const recurringItemsById = useMemo(
    () => new Map(recurringItems.map((item) => [item.id, item])),
    [recurringItems],
  );
  const budgetsById = useMemo(() => new Map(budgets.map((budget) => [budget.id, budget])), [budgets]);
  const balanceNameById = useMemo(() => new Map(balances.map((b) => [b.id, b.name])), [balances]);
  const autoMovesByIncomeId = useMemo(() => {
    const map = new Map<string, { destinationName: string; amount: number }[]>();
    for (const autoMove of incomeAutoMoves) {
      const list = map.get(autoMove.incomeId) ?? [];
      list.push({
        destinationName: balanceNameById.get(autoMove.destinationBalanceId) ?? "another account",
        amount: autoMove.amount,
      });
      map.set(autoMove.incomeId, list);
    }
    return map;
  }, [incomeAutoMoves, balanceNameById]);
  function frequencyForRow(row: ForecastRow): string | null {
    if (row.sourceType === "recurring") {
      const item = recurringItemsById.get(row.sourceId);
      return item ? summarizeRecurrence(item) : null;
    }
    if (row.sourceType === "budget_replenish" && row.budgetId) {
      const budget = budgetsById.get(row.budgetId);
      return budget ? budgetReplenishRuleSummary(budget, recurringItemsById) : null;
    }
    return null;
  }

  const rowsByDate = useMemo(() => {
    const map = new Map<string, ForecastRow[]>();
    for (const row of forecast) {
      // T212 follow-up: a `hidden` row (an auto-move's own debit/credit leg)
      // still counts toward accountBalanceAfterRow below (computed from the
      // full, unfiltered `forecast` prop), but never shows as its own day
      // entry or dot - the income row it's attached to carries a tag
      // instead.
      if (row.hidden) continue;
      const list = map.get(row.dueDate) ?? [];
      list.push(row);
      map.set(row.dueDate, list);
    }
    return map;
  }, [forecast]);

  // T191: same per-row account-balance lookup ForecastClient's table uses -
  // see that file's own comment for why it's a precomputed map rather than
  // a fresh walk per click.
  const accountBalanceAfterRow = useMemo(
    () => computeAccountBalancesAfterEachRow(forecast, balances),
    [forecast, balances],
  );

  const remindersByDate = useMemo(() => {
    const map = new Map<string, ReminderRow[]>();
    for (const reminder of reminders) {
      if (!reminder.due_date || reminder.completed) continue;
      const list = map.get(reminder.due_date) ?? [];
      list.push(reminder);
      map.set(reminder.due_date, list);
    }
    return map;
  }, [reminders]);

  const [viewYear, viewMonthNum] = viewMonth.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(viewYear, viewMonthNum - 1, 1)).getUTCDay();
  const totalDays = daysInMonth(viewYear, viewMonthNum);

  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => formatDate(viewYear, viewMonthNum, i + 1)),
  ];

  const openDayRows = openDay ? (rowsByDate.get(openDay) ?? []) : [];
  const openDayReminders = openDay ? (remindersByDate.get(openDay) ?? []) : [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Yellow marks forecast transactions, green marks a reminder - click a day to see them.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
            className="rounded border border-notion-hairline p-1.5 text-slate-500 hover:bg-notion-hover hover:text-notion-text"
          >
            <ChevronIcon direction="left" className="h-4 w-4" />
          </button>
          <p className="w-32 text-center font-medium text-notion-text">{formatMonthYear(`${viewMonth}-01`)}</p>
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
            className="rounded border border-notion-hairline p-1.5 text-slate-500 hover:bg-notion-hover hover:text-notion-text"
          >
            <ChevronIcon direction="right" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-notion-hairline bg-white p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-1">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((dateStr, index) => {
            if (dateStr === null) return <div key={`blank-${index}`} />;
            const rows = rowsByDate.get(dateStr) ?? [];
            const dayReminders = remindersByDate.get(dateStr) ?? [];
            const isToday = dateStr === today;
            const clickable = rows.length > 0 || dayReminders.length > 0;
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => clickable && setOpenDay(dateStr)}
                className={`flex aspect-square flex-col items-center justify-center rounded border p-1 text-sm ${
                  isToday ? "border-notion-accent" : "border-notion-hairline"
                } ${clickable ? "cursor-pointer hover:bg-notion-hover" : "cursor-default"}`}
              >
                <span className={isToday ? "font-semibold text-notion-accent" : "text-notion-text"}>
                  {Number(dateStr.slice(8, 10))}
                </span>
                {(rows.length > 0 || dayReminders.length > 0) && (
                  <span className="mt-0.5 flex items-center gap-0.5">
                    {rows.length > 0 && (
                      <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-semibold text-amber-950">
                        {rows.length}
                      </span>
                    )}
                    {dayReminders.length > 0 && (
                      <span
                        className="h-2 w-2 rounded-full bg-green-500"
                        title={`${dayReminders.length} reminder${dayReminders.length === 1 ? "" : "s"} due`}
                      />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {openDay && (
        <Modal title={formatFullDate(openDay)} onClose={() => setOpenDay(null)}>
          {openDayReminders.length > 0 && (
            <div className="mb-3 rounded border border-notion-hairline border-l-4 border-l-green-400 bg-green-50/40 p-2">
              <ul className="space-y-1">
                {openDayReminders.map((reminder) => (
                  <li key={reminder.id} className="flex items-center gap-1.5 text-sm text-notion-text">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" aria-hidden="true" />
                    {reminder.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {openDayRows.length > 0 && (
            <ul className="space-y-2">
              {openDayRows.map((row, index) => (
                <li key={`${row.sourceType}-${row.sourceId}-${index}`}>
                  <button
                    type="button"
                    // T174: a scenario row's `sourceId` is a
                    // scenario_recurring_items/scenario_one_off_items id, not a
                    // real one - EditSettleModal's actions would write against
                    // an id that doesn't exist in the real tables it knows
                    // about. Same exclusion ForecastClient.tsx applies; editing
                    // happens on /scenarios instead. Preview mode disables it
                    // for the same reason table rows are disabled there.
                    disabled={row.fromScenario || previewMode}
                    onClick={() => {
                      setOpenDay(null);
                      setSelectedRow(row);
                    }}
                    className={`flex w-full items-center justify-between rounded border border-notion-hairline p-2 text-left ${
                      row.fromScenario || previewMode ? "cursor-default" : "hover:bg-notion-hover"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className={`mr-1.5 text-xs ${TYPE_COLOR[row.type]}`}>{TYPE_LABEL[row.type]}</span>
                      {row.name}
                      {row.fromScenario && (
                        <span
                          className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800"
                          title="Part of an active scenario, not real data - manage it from Scenarios"
                        >
                          scenario
                        </span>
                      )}
                      {/* T212 follow-up: same hover tag ForecastClient.tsx's
                          Account column carries. */}
                      {row.sourceType === "recurring" &&
                        row.type === "income" &&
                        (autoMovesByIncomeId.get(row.sourceId)?.length ?? 0) > 0 && (
                          <span
                            className="ml-1.5 rounded-full bg-notion-hover px-1.5 py-0.5 text-[10px] font-medium text-notion-accent"
                            title={autoMovesByIncomeId
                              .get(row.sourceId)!
                              .map((m) => `Auto-moves ${formatCentavos(m.amount, currency)} to ${m.destinationName}`)
                              .join("; ")}
                          >
                            auto-move
                          </span>
                        )}
                    </span>
                    <span className="ml-2 shrink-0 text-right text-sm text-slate-600">
                      {formatCentavos(row.amount, currency)}
                      {row.feeAmount ? (
                        <span className="block text-xs text-slate-400">
                          - {formatCentavos(row.feeAmount, currency)} fee
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {selectedRow && (
        <EditSettleModal
          row={selectedRow}
          currency={currency}
          balances={balances}
          accountBalanceAtRow={accountBalanceForRow(selectedRow, accountBalanceAfterRow)}
          frequencySummary={frequencyForRow(selectedRow)}
          autoMoves={
            selectedRow.sourceType === "recurring" && selectedRow.type === "income"
              ? (autoMovesByIncomeId.get(selectedRow.sourceId) ?? null)
              : null
          }
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}
