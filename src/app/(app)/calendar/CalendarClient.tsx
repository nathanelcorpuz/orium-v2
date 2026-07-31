"use client";

import { useMemo, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { formatFullDate, formatMonthYear } from "@/lib/date";
import { daysInMonth, formatDate } from "@/lib/engine/date-utils";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/forecastLabels";
import { ChevronIcon } from "@/components/navIcons";
import { Modal } from "@/components/Modal";
import { EditSettleModal } from "@/app/(app)/forecast/EditSettleModal";
import { RemindersContent, type ReminderRow } from "@/app/(app)/forecast/RemindersPanel";
import type { ForecastRow } from "@/lib/engine/types";
import type { BalanceRow } from "@/app/(app)/accounts/BalanceModal";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// T164 (SPEC.md Phase 20): scoping decisions made against the task's own
// open questions, per the user's standing authority to make these calls.
//
// Month grid, not an agenda list - "calendar" is the word the user used, and
// a month grid is what that word means colloquially; it also plays well
// with per-day color-coding, which the request was built around.
//
// A day with many transactions shows a count badge, not every row inline -
// a 7-column grid cell has no room for that, so each day is clickable to a
// list, matching the click-to-open-detail pattern every other list page in
// this app already uses.
//
// Read-only for viewing shape, but every listed transaction opens the same
// EditSettleModal the Forecast page already uses - reusing that modal
// rather than building a second edit surface for the same rows.
//
// Reminders don't get plotted on specific day cells: the `reminders` table
// has no due-date column at all (id/text/completed/completed_at only), so
// there is no date to place one on. The user's "green = todos/reminders"
// is honored as a persistent panel alongside the grid (reusing
// RemindersPanel exactly as the Forecast page already does) rather than by
// inventing a due-date concept this feature never had.
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

export function CalendarClient({
  forecast,
  balances,
  currency,
  reminders,
  today,
}: {
  forecast: ForecastRow[];
  balances: BalanceRow[];
  currency: string;
  reminders: ReminderRow[];
  today: string;
}) {
  const [viewMonth, setViewMonth] = useState(() => monthKey(today));
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<ForecastRow | null>(null);
  const [showCompletedReminders, setShowCompletedReminders] = useState(false);
  const activeReminders = reminders.filter((r) => !r.completed);
  const completedReminders = reminders.filter((r) => r.completed);

  const rowsByDate = useMemo(() => {
    const map = new Map<string, ForecastRow[]>();
    for (const row of forecast) {
      const list = map.get(row.dueDate) ?? [];
      list.push(row);
      map.set(row.dueDate, list);
    }
    return map;
  }, [forecast]);

  const [viewYear, viewMonthNum] = viewMonth.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(viewYear, viewMonthNum - 1, 1)).getUTCDay();
  const totalDays = daysInMonth(viewYear, viewMonthNum);

  // A standard 7-column grid: leading blanks to align the 1st on its real
  // weekday, then every day of the month, no trailing padding needed since
  // the grid just wraps naturally.
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => formatDate(viewYear, viewMonthNum, i + 1)),
  ];

  const openDayRows = openDay ? (rowsByDate.get(openDay) ?? []) : [];

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">Calendar</h1>
            <p className="text-slate-500">
              Yellow marks a day with forecast transactions - click a day to see them.
            </p>
          </div>
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

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="min-w-0 flex-1 rounded-lg border border-notion-hairline bg-white p-4">
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
                const isToday = dateStr === today;
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => rows.length > 0 && setOpenDay(dateStr)}
                    className={`flex aspect-square flex-col items-center justify-center rounded border p-1 text-sm ${
                      isToday ? "border-notion-accent" : "border-notion-hairline"
                    } ${rows.length > 0 ? "cursor-pointer hover:bg-notion-hover" : "cursor-default"}`}
                  >
                    <span className={isToday ? "font-semibold text-notion-accent" : "text-notion-text"}>
                      {Number(dateStr.slice(8, 10))}
                    </span>
                    {rows.length > 0 && (
                      <span className="mt-0.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-semibold text-amber-950">
                        {rows.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Green accent border for the user's own "green = reminders"
              color-coding. RemindersContent (not the full RemindersPanel) -
              see its own comment for why: that panel's outer chrome is built
              for the Forecast page's full-height right rail specifically. */}
          <div className="flex w-full shrink-0 flex-col rounded-lg border border-notion-hairline border-l-4 border-l-green-400 bg-white lg:w-72">
            <RemindersContent
              activeReminders={activeReminders}
              completedReminders={completedReminders}
              showCompleted={showCompletedReminders}
              setShowCompleted={setShowCompletedReminders}
            />
          </div>
        </div>
      </div>

      {openDay && (
        <Modal title={formatFullDate(openDay)} onClose={() => setOpenDay(null)}>
          <ul className="space-y-2">
            {openDayRows.map((row, index) => (
              <li key={`${row.sourceType}-${row.sourceId}-${index}`}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenDay(null);
                    setSelectedRow(row);
                  }}
                  className="flex w-full items-center justify-between rounded border border-notion-hairline p-2 text-left hover:bg-notion-hover"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className={`mr-1.5 text-xs ${TYPE_COLOR[row.type]}`}>{TYPE_LABEL[row.type]}</span>
                    {row.name}
                  </span>
                  <span className="ml-2 shrink-0 text-right text-sm text-slate-600">
                    {formatCentavos(row.amount, currency)}
                    {/* T172: same "own line, not folded into amount" as the
                        Forecast table. */}
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
        </Modal>
      )}

      {selectedRow && (
        <EditSettleModal
          row={selectedRow}
          currency={currency}
          balances={balances}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}
