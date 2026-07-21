"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { computeBudgetCycleStatus } from "@/lib/engine/budgetCycles";
import { summarizeRecurrence } from "@/lib/recurrenceSummary";
import type {
  BudgetEntry as EngineBudgetEntry,
  OccurrenceOverride,
  RecurrenceEndsType,
  RecurrenceUnit,
  RecurringItem,
} from "@/lib/engine/types";
import { deleteBudget, deleteBudgetEntry, logSpend, type BudgetActionState } from "./actions";
import type { BudgetRow } from "./BudgetModal";

export type BudgetEntryRow = {
  id: string;
  entry_date: string;
  amount: number;
  note: string | null;
};

export type IncomeItemRow = {
  id: string;
  name: string;
  type: "income";
  amount: number;
  start_date: string;
  interval: number;
  unit: RecurrenceUnit;
  weekdays: number[] | null;
  days_of_month: number[] | null;
  ordinal: number | null;
  ordinal_weekday: number | null;
  ends_type: RecurrenceEndsType;
  end_date: string | null;
  occurrence_count: number | null;
};

export type OverrideRow = {
  id: string;
  recurring_item_id: string;
  original_date: string;
  new_date: string | null;
  new_amount: number | null;
  new_name: string | null;
  skipped: boolean;
};

const initialLogState: BudgetActionState = { error: null };

function toEngineBudget(budget: BudgetRow) {
  return {
    id: budget.id,
    name: budget.name,
    monthlyAllocation: budget.monthly_allocation,
    allocation: budget.allocation,
    carryoverEnabled: budget.carryover_enabled,
    createdAt: budget.created_at.slice(0, 10),
    linkedIncomeId: budget.linked_income_id,
    startDate: budget.start_date,
    interval: budget.interval,
    unit: budget.unit,
    weekdays: budget.weekdays,
    daysOfMonth: budget.days_of_month,
    ordinal: budget.ordinal,
    ordinalWeekday: budget.ordinal_weekday,
    endsType: budget.ends_type,
    endDate: budget.end_date,
    occurrenceCount: budget.occurrence_count,
  };
}

function toEngineIncomes(incomes: IncomeItemRow[]): RecurringItem[] {
  return incomes.map((income) => ({
    id: income.id,
    name: income.name,
    type: income.type,
    amount: income.amount,
    startDate: income.start_date,
    interval: income.interval,
    unit: income.unit,
    weekdays: income.weekdays,
    daysOfMonth: income.days_of_month,
    ordinal: income.ordinal,
    ordinalWeekday: income.ordinal_weekday,
    endsType: income.ends_type,
    endDate: income.end_date,
    occurrenceCount: income.occurrence_count,
  }));
}

function toEngineOverrides(overrides: OverrideRow[]): OccurrenceOverride[] {
  return overrides.map((o) => ({
    id: o.id,
    recurringItemId: o.recurring_item_id,
    originalDate: o.original_date,
    newDate: o.new_date,
    newAmount: o.new_amount,
    newName: o.new_name,
    skipped: o.skipped,
  }));
}

function toEngineEntries(entries: BudgetEntryRow[], budgetId: string): EngineBudgetEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    budgetId,
    entryDate: entry.entry_date,
    amount: entry.amount,
    note: entry.note,
  }));
}

function scheduleDescription(
  source: "linked_income" | "own_schedule" | "fallback",
  budget: BudgetRow,
  incomeNameById: Map<string, string>,
): string {
  if (source === "linked_income") {
    const name = budget.linked_income_id ? incomeNameById.get(budget.linked_income_id) : undefined;
    return name ? `Resets with ${name}` : "Resets with linked income";
  }
  if (source === "own_schedule" && budget.unit && budget.interval && budget.start_date && budget.ends_type) {
    const summary = summarizeRecurrence({
      startDate: budget.start_date,
      interval: budget.interval,
      unit: budget.unit,
      weekdays: budget.weekdays,
      daysOfMonth: budget.days_of_month,
      ordinal: budget.ordinal,
      ordinalWeekday: budget.ordinal_weekday,
      endsType: budget.ends_type,
      endDate: budget.end_date,
      occurrenceCount: budget.occurrence_count,
    });
    return `Resets ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`;
  }
  return "Resets monthly on the 1st";
}

export function BudgetCard({
  budget,
  entries,
  incomes,
  overrides,
  onEdit,
}: {
  budget: BudgetRow;
  entries: BudgetEntryRow[];
  incomes: IncomeItemRow[];
  overrides: OverrideRow[];
  onEdit: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingEntryId, setConfirmingEntryId] = useState<string | null>(null);
  const today = todayInManila();

  const incomeNameById = new Map(incomes.map((income) => [income.id, income.name]));

  const status = computeBudgetCycleStatus(
    toEngineBudget(budget),
    toEngineEntries(entries, budget.id),
    toEngineIncomes(incomes),
    toEngineOverrides(overrides),
    today,
  );
  const available = status.allocation + status.carriedIn;
  const progressPercent =
    available > 0 ? Math.min((status.spent / available) * 100, 100) : status.spent > 0 ? 100 : 0;
  const currentCycleEntries = entries
    .filter((entry) => entry.entry_date >= status.currentCycleStart)
    .sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));

  const [logState, logAction, logPending] = useActionState(logSpend, initialLogState);
  const logFormRef = useRef<HTMLFormElement>(null);
  const loggedOnce = useRef(false);

  useEffect(() => {
    if (loggedOnce.current && !logPending && !logState.error) {
      logFormRef.current?.reset();
    }
  }, [logPending, logState]);

  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{budget.name}</p>
            {status.source === "fallback" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Needs a schedule
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {formatCentavos(status.spent)} of {formatCentavos(available)} spent this cycle
          </p>
          <p className="text-sm text-slate-400">
            {scheduleDescription(status.source, budget, incomeNameById)}
            {status.carriedIn !== 0 &&
              ` · ${status.carriedIn > 0 ? "+" : ""}${formatCentavos(status.carriedIn)} carried over`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {confirmingDelete ? (
            <>
              <span className="text-sm text-slate-600">Delete?</span>
              <form action={deleteBudget}>
                <input type="hidden" name="id" value={budget.id} />
                <button
                  type="submit"
                  className="rounded border border-red-300 px-3 py-1 text-sm text-red-600"
                >
                  Yes
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded border border-slate-300 px-3 py-1 text-sm"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="rounded border border-slate-300 px-3 py-1 text-sm"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="rounded border border-red-300 px-3 py-1 text-sm text-red-600"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full ${status.over > 0 ? "bg-red-500" : "bg-teal-600"}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {status.over > 0 ? (
        <p className="mb-3 text-sm font-medium text-red-600">Over by {formatCentavos(status.over)}</p>
      ) : (
        <p className="mb-3 text-sm text-slate-500">{formatCentavos(status.remaining)} remaining</p>
      )}

      {currentCycleEntries.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm text-slate-600">
          {currentCycleEntries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {entry.entry_date}
                {entry.note && ` - ${entry.note}`}
              </span>
              <span className="flex items-center gap-2">
                <span>{formatCentavos(entry.amount)}</span>
                {confirmingEntryId === entry.id ? (
                  <>
                    <form action={deleteBudgetEntry}>
                      <input type="hidden" name="id" value={entry.id} />
                      <button type="submit" className="text-xs text-red-600 underline">
                        Yes
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => setConfirmingEntryId(null)}
                      className="text-xs text-slate-400 underline"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingEntryId(entry.id)}
                    className="text-xs text-slate-400 hover:text-red-600"
                    aria-label={`Delete entry ${entry.entry_date}`}
                  >
                    Delete
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={logFormRef}
        action={logAction}
        onSubmit={() => {
          loggedOnce.current = true;
        }}
        className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"
      >
        <input type="hidden" name="budgetId" value={budget.id} />
        <input type="hidden" name="budgetName" value={budget.name} />
        <div>
          <label className="block text-xs text-slate-500" htmlFor={`amountPesos-${budget.id}`}>
            Amount (₱)
          </label>
          <input
            id={`amountPesos-${budget.id}`}
            name="amountPesos"
            type="number"
            step="0.01"
            min="0"
            required
            className="mt-1 w-28 rounded border border-slate-300 p-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500" htmlFor={`entryDate-${budget.id}`}>
            Date
          </label>
          <input
            id={`entryDate-${budget.id}`}
            name="entryDate"
            type="date"
            defaultValue={today}
            required
            className="mt-1 rounded border border-slate-300 p-1.5 text-sm"
          />
        </div>
        <div className="min-w-[8rem] flex-1">
          <label className="block text-xs text-slate-500" htmlFor={`note-${budget.id}`}>
            Note
          </label>
          <input
            id={`note-${budget.id}`}
            name="note"
            type="text"
            className="mt-1 w-full rounded border border-slate-300 p-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={logPending}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {logPending ? "Logging..." : "Log spend"}
        </button>
      </form>
      {logState.error && <p className="mt-2 text-sm text-red-600">{logState.error}</p>}
    </div>
  );
}
