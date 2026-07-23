"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { SegmentedControl } from "@/components/SegmentedControl";
import { centavosToPesosString } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import type { ForecastRow } from "@/lib/engine/types";
import { deleteBudgetEntry, updateBudgetEntry, type BudgetActionState } from "@/app/(app)/budgets/actions";
import {
  editOneOff,
  editRecurringOccurrence,
  settleBudgetReplenish,
  settleOccurrence,
  type ForecastActionState,
} from "./actions";

const initialState: ForecastActionState = { error: null };
const initialEntryState: BudgetActionState = { error: null };

export function EditSettleModal({
  row,
  currency,
  onClose,
}: {
  row: ForecastRow;
  currency: string;
  onClose: () => void;
}) {
  // Future-dated budget entries (SPEC.md T43/T57) are editable directly from
  // the Forecast - a real budget_entries row (spend, replenishment, or
  // manual add/take), not a projected occurrence, so they skip the edit/
  // settle toggle entirely (no Settle equivalent - a ledger entry already
  // *is* the actual transaction) and reuse the existing
  // updateBudgetEntry/deleteBudgetEntry actions from the Budgets page
  // (budgets/actions.ts) rather than new ones, since those already do
  // exactly what's needed here (including revalidating /forecast).
  const isBudgetEntry = row.sourceType === "budget_entry";
  // Phase 11 (T59): a projected replenish occurrence for a budget on its
  // own schedule ("replenish every") - settle-only, no Edit tab (there's
  // nothing to move/rename before settling, per budget_replenish_overrides'
  // v1 scope). Only ever reached for row.budgetSettleable rows -
  // ForecastClient never makes an income-linked budget_replenish row
  // clickable, since those settle automatically via their linked income.
  const isBudgetReplenish = row.sourceType === "budget_replenish";
  const [mode, setMode] = useState<"edit" | "settle">("edit");
  const editAction = row.sourceType === "recurring" ? editRecurringOccurrence : editOneOff;
  const [editState, editFormAction, editPending] = useActionState(editAction, initialState);
  const [settleState, settleFormAction, settlePending] = useActionState(
    settleOccurrence,
    initialState,
  );
  const [entryState, entryFormAction, entryPending] = useActionState(
    updateBudgetEntry,
    initialEntryState,
  );
  const [replenishState, replenishFormAction, replenishPending] = useActionState(
    settleBudgetReplenish,
    initialState,
  );
  const submitted = useRef(false);

  useEffect(() => {
    if (
      submitted.current &&
      !editPending &&
      !settlePending &&
      !entryPending &&
      !replenishPending &&
      !editState.error &&
      !settleState.error &&
      !entryState.error &&
      !replenishState.error
    ) {
      onClose();
    }
  }, [
    editPending,
    settlePending,
    entryPending,
    replenishPending,
    editState,
    settleState,
    entryState,
    replenishState,
    onClose,
  ]);

  return (
    <Modal title={row.name} onClose={onClose}>
      {!isBudgetEntry && !isBudgetReplenish && (
        <div className="mb-4">
          <SegmentedControl
            options={[
              { value: "edit", label: "Edit" },
              { value: "settle", label: "Settle" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
      )}

      {isBudgetReplenish ? (
        <form
          action={replenishFormAction}
          onSubmit={() => {
            submitted.current = true;
          }}
          className="space-y-4"
        >
          <input type="hidden" name="budgetId" value={row.budgetId} />
          <input type="hidden" name="budgetName" value={row.budgetName} />
          <input type="hidden" name="originalDate" value={row.originalDate} />
          <input type="hidden" name="forecastedAmount" value={row.amount} />
          <input type="hidden" name="forecastedDate" value={row.dueDate} />
          <input type="hidden" name="forecastedBalance" value={row.runningBalance} />
          <p className="text-sm text-slate-500">
            Forecasted: {formatFullDate(row.dueDate)}, {centavosToPesosString(Math.abs(row.amount))} {currency}
          </p>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="actualAmountPesos">
              Actual amount ({currency})
            </label>
            <input
              id="actualAmountPesos"
              name="actualAmountPesos"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={centavosToPesosString(Math.abs(row.amount))}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="actualDate">
              Actual date
            </label>
            <input
              id="actualDate"
              name="actualDate"
              type="date"
              required
              defaultValue={row.dueDate}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          {replenishState.error && <p className="text-sm text-red-600">{replenishState.error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={replenishPending}
              className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
            >
              {replenishPending ? "Settling..." : "Settle"}
            </button>
          </div>
        </form>
      ) : isBudgetEntry ? (
        <>
          <form
            action={entryFormAction}
            onSubmit={() => {
              submitted.current = true;
            }}
            className="space-y-4"
          >
            <input type="hidden" name="id" value={row.sourceId} />
            <input type="hidden" name="budgetId" value={row.budgetId} />
            <input type="hidden" name="budgetName" value={row.budgetName} />
            <div>
              <label className="block text-sm text-slate-600" htmlFor="amountPesos">
                Amount ({currency}) — {row.amount > 0 ? "incoming" : "outgoing"}
              </label>
              <input
                id="amountPesos"
                name="amountPesos"
                type="number"
                step="0.01"
                min="0"
                required
                // budget_entries.amount is always a positive magnitude
                // (direction carries the sign) - row.amount here already
                // carries that sign (SPEC.md T57), so Math.abs undoes it for
                // display regardless of direction, unlike the old
                // always-negative assumption (-row.amount).
                defaultValue={centavosToPesosString(Math.abs(row.amount))}
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600" htmlFor="entryDate">
                Date
              </label>
              <input
                id="entryDate"
                name="entryDate"
                type="date"
                required
                defaultValue={row.dueDate}
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600" htmlFor="note">
                Note
              </label>
              <input
                id="note"
                name="note"
                type="text"
                defaultValue={row.note ?? ""}
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
              />
            </div>
            {entryState.error && <p className="text-sm text-red-600">{entryState.error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={entryPending}
                className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
              >
                {entryPending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
          <form action={deleteBudgetEntry} onSubmit={onClose} className="mt-3 border-t border-notion-hairline pt-3">
            <input type="hidden" name="id" value={row.sourceId} />
            <button type="submit" className="text-sm text-red-600 underline">
              Delete this entry
            </button>
          </form>
        </>
      ) : mode === "edit" ? (
        <form
          action={editFormAction}
          onSubmit={() => {
            submitted.current = true;
          }}
          className="space-y-4"
        >
          <input type="hidden" name="sourceId" value={row.sourceId} />
          <input type="hidden" name="originalDate" value={row.originalDate} />
          <div>
            <label className="block text-sm text-slate-600" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={row.name}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="amountPesos">
              Amount ({currency})
            </label>
            <input
              id="amountPesos"
              name="amountPesos"
              type="number"
              step="0.01"
              required
              defaultValue={centavosToPesosString(row.amount)}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="date">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              defaultValue={row.dueDate}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          {editState.error && <p className="text-sm text-red-600">{editState.error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editPending}
              className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
            >
              {editPending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <form
          action={settleFormAction}
          onSubmit={() => {
            submitted.current = true;
          }}
          className="space-y-4"
        >
          <input type="hidden" name="sourceType" value={row.sourceType} />
          <input type="hidden" name="sourceId" value={row.sourceId} />
          <input type="hidden" name="originalDate" value={row.originalDate} />
          <input type="hidden" name="name" value={row.name} />
          <input type="hidden" name="type" value={row.type} />
          <input type="hidden" name="forecastedAmount" value={row.amount} />
          <input type="hidden" name="forecastedDate" value={row.dueDate} />
          <input type="hidden" name="forecastedBalance" value={row.runningBalance} />
          <p className="text-sm text-slate-500">
            Forecasted: {formatFullDate(row.dueDate)}, {centavosToPesosString(row.amount)} {currency}
          </p>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="actualAmountPesos">
              Actual amount ({currency})
            </label>
            <input
              id="actualAmountPesos"
              name="actualAmountPesos"
              type="number"
              step="0.01"
              required
              defaultValue={centavosToPesosString(row.amount)}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="actualDate">
              Actual date
            </label>
            <input
              id="actualDate"
              name="actualDate"
              type="date"
              required
              defaultValue={row.dueDate}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          {settleState.error && <p className="text-sm text-red-600">{settleState.error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={settlePending}
              className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
            >
              {settlePending ? "Settling..." : "Settle"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
