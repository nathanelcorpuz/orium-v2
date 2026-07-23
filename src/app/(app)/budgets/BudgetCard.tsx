"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { centavosToPesosString, formatCentavos } from "@/lib/money";
import { formatFullDate, todayInManila } from "@/lib/date";
import { budgetReplenishRule, computeBudgetBalance, replenishProgress } from "@/lib/engine/budgetLedger";
import { toEngineBudget } from "@/lib/budgetView";
import { ProgressBar } from "@/components/ProgressBar";
import { summarizeRecurrence } from "@/lib/recurrenceSummary";
import type { BudgetEntry, RecurrenceEndsType, RecurrenceUnit } from "@/lib/engine/types";
import type { BudgetRow } from "@/lib/budgetView";
import {
  addFunds,
  deleteBudget,
  deleteBudgetEntry,
  logSpend,
  takeFunds,
  updateBudgetEntry,
  type BudgetActionState,
} from "./actions";

// Simplified, page-local shapes (SPEC.md Phase 10/T55) - the fuller
// budgetView.ts versions of these still exist for actions.ts's own
// server-side needs, but this page's UI only ever needs id/name for an
// income and id/entry_date/amount/note/direction for an entry.
export type BudgetEntryRow = {
  id: string;
  entry_date: string;
  amount: number;
  note: string | null;
  direction?: "incoming" | "outgoing";
};

// Phase 11 (T60): the recurrence rule too, not just id/name - an
// income-linked budget's progress bar resolves its schedule from whichever
// income it's linked to (budgetReplenishRule, engine/budgetLedger.ts).
export type IncomeItemRow = {
  id: string;
  name: string;
  startDate: string;
  interval: number;
  unit: RecurrenceUnit;
  weekdays: number[] | null;
  daysOfMonth: number[] | null;
  ordinal: number | null;
  ordinalWeekday: number | null;
  endsType: RecurrenceEndsType;
  endDate: string | null;
  occurrenceCount: number | null;
};

const initialLogState: BudgetActionState = { error: null };

function toEngineEntries(entries: BudgetEntryRow[], budgetId: string): BudgetEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    budgetId,
    entryDate: entry.entry_date,
    amount: entry.amount,
    note: entry.note,
    direction: entry.direction,
  }));
}

// One ledger entry (spend, manual add, or manual take - SPEC.md Phase 10).
// Its own component so each entry gets an independent useActionState/edit-
// mode instead of one shared across the whole list.
function BudgetEntryListItem({
  entry,
  budgetId,
  budgetName,
}: {
  entry: BudgetEntryRow;
  budgetId: string;
  budgetName: string;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [editState, editFormAction, editPending] = useActionState(updateBudgetEntry, initialLogState);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !editPending && !editState.error) {
      setMode("view");
      submitted.current = false;
    }
  }, [editPending, editState]);

  if (mode === "edit") {
    return (
      <li>
        <form
          action={editFormAction}
          onSubmit={() => {
            submitted.current = true;
          }}
          className="flex flex-wrap items-end gap-2 py-1"
        >
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="budgetId" value={budgetId} />
          <input type="hidden" name="budgetName" value={budgetName} />
          <input
            name="amountPesos"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={centavosToPesosString(entry.amount)}
            aria-label="Amount"
            className="w-20 rounded border border-notion-hairline p-1 text-xs text-notion-text"
          />
          <input
            name="entryDate"
            type="date"
            required
            defaultValue={entry.entry_date}
            aria-label="Date"
            className="rounded border border-notion-hairline p-1 text-xs text-notion-text"
          />
          <input
            name="note"
            type="text"
            defaultValue={entry.note ?? ""}
            aria-label="Note"
            className="min-w-[6rem] flex-1 rounded border border-notion-hairline p-1 text-xs text-notion-text"
          />
          <button type="submit" disabled={editPending} className="text-xs text-slate-600 underline">
            {editPending ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setMode("view")}
            className="text-xs text-slate-400 underline"
          >
            Cancel
          </button>
        </form>
        {editState.error && <p className="text-xs text-red-600">{editState.error}</p>}
      </li>
    );
  }

  if (mode === "delete") {
    return (
      <li className="flex items-center justify-between gap-2 text-sm">
        <span className="text-slate-600">Delete this entry?</span>
        <span className="flex items-center gap-2">
          <form action={deleteBudgetEntry}>
            <input type="hidden" name="id" value={entry.id} />
            <button type="submit" className="text-xs text-red-600 underline">
              Yes
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMode("view")}
            className="text-xs text-slate-400 underline"
          >
            Cancel
          </button>
        </span>
      </li>
    );
  }

  const isIncoming = entry.direction === "incoming";
  return (
    <li className="flex items-center justify-between gap-2 text-sm text-notion-text">
      <span className="truncate">
        {formatFullDate(entry.entry_date)}
        {entry.note && ` - ${entry.note}`}
      </span>
      <span className="flex items-center gap-2">
        <span className={isIncoming ? "text-green-700" : "text-slate-600"}>
          {isIncoming ? "+" : "-"}
          {formatCentavos(entry.amount)}
        </span>
        <button
          type="button"
          onClick={() => setMode("edit")}
          className="text-xs text-slate-400 hover:text-slate-700"
          aria-label={`Edit entry ${entry.entry_date}`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setMode("delete")}
          className="text-xs text-slate-400 hover:text-red-600"
          aria-label={`Delete entry ${entry.entry_date}`}
        >
          Delete
        </button>
      </span>
    </li>
  );
}

export function BudgetCard({
  budget,
  entries,
  incomes,
  onEdit,
}: {
  budget: BudgetRow;
  entries: BudgetEntryRow[];
  incomes: IncomeItemRow[];
  onEdit: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [monthFilter, setMonthFilter] = useState(""); // "" = all time
  const today = todayInManila();

  // The running total only counts what's actually happened so far
  // (budgetLedger.ts) - a future-dated entry hasn't landed yet, so it
  // doesn't count here; it shows up on the Forecast page instead, same
  // pattern T43 established for future spends.
  const balance = computeBudgetBalance(toEngineEntries(entries, budget.id), budget.id, today);

  const linkedIncome = budget.linked_income_id
    ? incomes.find((income) => income.id === budget.linked_income_id)
    : undefined;
  const incomeName = linkedIncome?.name;

  // Phase 11 (T60): "days until replenish" + a time-based progress bar, for
  // any budget with a resolvable schedule - its own ("replenish every") or
  // its linked income's. Manual budgets have neither, so replenishProgress
  // returns all-null and nothing extra renders.
  const rule = budgetReplenishRule(toEngineBudget(budget), linkedIncome ?? null);
  const progress = replenishProgress(rule, today);
  // "Connected to {income}" beats a schedule summary when both are somehow
  // present (shouldn't happen - DB-enforced mutually exclusive); a
  // schedule-mode budget shows its own human-readable rule the same way
  // Bills/Income/Debt/Savings rows already do (recurrenceSummary.ts).
  const replenishLabel = incomeName ? `Connected to ${incomeName}` : rule ? summarizeRecurrence(rule) : "Manual";

  const visibleEntries = entries
    .filter((entry) => entry.entry_date <= today)
    .filter((entry) => (monthFilter ? entry.entry_date.startsWith(monthFilter) : true))
    .sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));

  const [logState, logAction, logPending] = useActionState(logSpend, initialLogState);
  const logFormRef = useRef<HTMLFormElement>(null);
  const loggedOnce = useRef(false);
  useEffect(() => {
    if (loggedOnce.current && !logPending && !logState.error) {
      logFormRef.current?.reset();
    }
  }, [logPending, logState]);

  const [addState, addAction, addPending] = useActionState(addFunds, initialLogState);
  const addFormRef = useRef<HTMLFormElement>(null);
  const addedOnce = useRef(false);
  useEffect(() => {
    if (addedOnce.current && !addPending && !addState.error) {
      addFormRef.current?.reset();
    }
  }, [addPending, addState]);

  const [takeState, takeAction, takePending] = useActionState(takeFunds, initialLogState);
  const takeFormRef = useRef<HTMLFormElement>(null);
  const takenOnce = useRef(false);
  useEffect(() => {
    if (takenOnce.current && !takePending && !takeState.error) {
      takeFormRef.current?.reset();
    }
  }, [takePending, takeState]);

  return (
    <div className="rounded-lg border border-notion-hairline bg-white p-4">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-notion-text">{budget.name}</p>
            <span className="rounded-full bg-notion-hover px-2 py-0.5 text-xs font-medium text-slate-500">
              {replenishLabel}
            </span>
          </div>
          <p className={`text-xl font-semibold ${balance < 0 ? "text-red-600" : "text-notion-text"}`}>
            {formatCentavos(balance)}
          </p>
          {progress.daysUntil !== null && (
            <div className="mt-1 max-w-xs">
              <ProgressBar percent={(progress.fraction ?? 0) * 100} over={false} />
              <p className="mt-0.5 text-xs text-slate-400">
                {progress.daysUntil <= 0
                  ? "Replenishes today"
                  : `${progress.daysUntil} day${progress.daysUntil === 1 ? "" : "s"} until replenish`}
              </p>
            </div>
          )}
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
                className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
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

      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Entries</p>
        <input
          type="month"
          value={monthFilter}
          onChange={(event) => setMonthFilter(event.target.value)}
          aria-label={`Filter ${budget.name} entries by month`}
          className="rounded border border-notion-hairline p-1 text-xs text-notion-text"
        />
      </div>

      {visibleEntries.length > 0 ? (
        <ul className="mb-3 space-y-1">
          {visibleEntries.map((entry) => (
            <BudgetEntryListItem key={entry.id} entry={entry} budgetId={budget.id} budgetName={budget.name} />
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-slate-400">No entries{monthFilter ? " that month" : " yet"}.</p>
      )}

      <form
        ref={logFormRef}
        action={logAction}
        onSubmit={() => {
          loggedOnce.current = true;
        }}
        className="flex flex-wrap items-end gap-2 border-t border-notion-hairline pt-3"
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
            className="mt-1 w-28 rounded border border-notion-hairline p-1.5 text-sm text-notion-text"
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
            className="mt-1 rounded border border-notion-hairline p-1.5 text-sm text-notion-text"
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
            className="mt-1 w-full rounded border border-notion-hairline p-1.5 text-sm text-notion-text"
          />
        </div>
        <button
          type="submit"
          disabled={logPending}
          className="rounded bg-notion-text px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          {logPending ? "Logging..." : "Log spend"}
        </button>
      </form>
      {logState.error && <p className="mt-2 text-sm text-red-600">{logState.error}</p>}

      {!budget.linked_income_id && (
        <div className="mt-3 flex flex-wrap gap-4 border-t border-notion-hairline pt-3">
          <form
            ref={addFormRef}
            action={addAction}
            onSubmit={() => {
              addedOnce.current = true;
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="budgetId" value={budget.id} />
            <input type="hidden" name="budgetName" value={budget.name} />
            <input type="hidden" name="entryDate" value={today} />
            <div>
              <label className="block text-xs text-slate-500" htmlFor={`addAmount-${budget.id}`}>
                Add funds (₱)
              </label>
              <input
                id={`addAmount-${budget.id}`}
                name="amountPesos"
                type="number"
                step="0.01"
                min="0"
                required
                className="mt-1 w-28 rounded border border-notion-hairline p-1.5 text-sm text-notion-text"
              />
            </div>
            <button
              type="submit"
              disabled={addPending}
              className="rounded border border-notion-hairline px-3 py-1.5 text-sm text-green-700 hover:bg-notion-hover disabled:opacity-50"
            >
              {addPending ? "Adding..." : "Add"}
            </button>
          </form>
          {addState.error && <p className="text-sm text-red-600">{addState.error}</p>}

          <form
            ref={takeFormRef}
            action={takeAction}
            onSubmit={() => {
              takenOnce.current = true;
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="budgetId" value={budget.id} />
            <input type="hidden" name="budgetName" value={budget.name} />
            <input type="hidden" name="entryDate" value={today} />
            <div>
              <label className="block text-xs text-slate-500" htmlFor={`takeAmount-${budget.id}`}>
                Take funds (₱)
              </label>
              <input
                id={`takeAmount-${budget.id}`}
                name="amountPesos"
                type="number"
                step="0.01"
                min="0"
                required
                className="mt-1 w-28 rounded border border-notion-hairline p-1.5 text-sm text-notion-text"
              />
            </div>
            <button
              type="submit"
              disabled={takePending}
              className="rounded border border-notion-hairline px-3 py-1.5 text-sm text-red-600 hover:bg-notion-hover disabled:opacity-50"
            >
              {takePending ? "Taking..." : "Take"}
            </button>
          </form>
          {takeState.error && <p className="text-sm text-red-600">{takeState.error}</p>}
        </div>
      )}
    </div>
  );
}
