"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { currentMonthBudgetStatus } from "@/lib/engine/budgets";
import { deleteBudget, logSpend, type BudgetActionState } from "./actions";
import type { BudgetRow } from "./BudgetModal";

export type BudgetEntryRow = {
  id: string;
  entry_date: string;
  amount: number;
  note: string | null;
};

const initialLogState: BudgetActionState = { error: null };

export function BudgetCard({
  budget,
  entries,
  onEdit,
}: {
  budget: BudgetRow;
  entries: BudgetEntryRow[];
  onEdit: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const today = todayInManila();

  const { remaining, overBy } = currentMonthBudgetStatus(
    { id: budget.id, monthlyAllocation: budget.monthly_allocation },
    entries.map((entry) => ({
      id: entry.id,
      budgetId: budget.id,
      entryDate: entry.entry_date,
      amount: entry.amount,
      note: entry.note,
    })),
    today,
  );
  const spent = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const progressPercent =
    budget.monthly_allocation > 0
      ? Math.min((spent / budget.monthly_allocation) * 100, 100)
      : spent > 0
        ? 100
        : 0;

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
          <p className="font-medium">{budget.name}</p>
          <p className="text-sm text-slate-500">
            {formatCentavos(spent)} of {formatCentavos(budget.monthly_allocation)} spent this month
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
          className={`h-full ${overBy > 0 ? "bg-red-500" : "bg-teal-600"}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {overBy > 0 ? (
        <p className="mb-3 text-sm font-medium text-red-600">Over by {formatCentavos(overBy)}</p>
      ) : (
        <p className="mb-3 text-sm text-slate-500">{formatCentavos(remaining)} remaining</p>
      )}

      {entries.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm text-slate-600">
          {entries.map((entry) => (
            <li key={entry.id} className="flex justify-between">
              <span>
                {entry.entry_date}
                {entry.note && ` - ${entry.note}`}
              </span>
              <span>{formatCentavos(entry.amount)}</span>
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
