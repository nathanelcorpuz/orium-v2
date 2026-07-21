"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { centavosToPesosString } from "@/lib/money";
import type { ForecastRow } from "@/lib/engine/types";
import {
  editBudgetOccurrence,
  editOneOff,
  editRecurringOccurrence,
  settleOccurrence,
  skipBudgetOccurrence,
  type ForecastActionState,
} from "./actions";

const initialState: ForecastActionState = { error: null };

export function EditSettleModal({
  row,
  currency,
  onClose,
}: {
  row: ForecastRow;
  currency: string;
  onClose: () => void;
}) {
  // Budget rows have no Settle equivalent - logging a spend (Budgets page /
  // Forecast sidebar panel) already covers that - and no per-occurrence
  // Name (it's a computed label, not stored), so they skip the edit/settle
  // toggle entirely and get a dedicated Amount+Date form plus a Skip button.
  const isBudget = row.sourceType === "budget";
  const [mode, setMode] = useState<"edit" | "settle">("edit");
  const editAction =
    row.sourceType === "recurring"
      ? editRecurringOccurrence
      : row.sourceType === "one_off"
        ? editOneOff
        : editBudgetOccurrence;
  const [editState, editFormAction, editPending] = useActionState(editAction, initialState);
  const [settleState, settleFormAction, settlePending] = useActionState(
    settleOccurrence,
    initialState,
  );
  const submitted = useRef(false);

  useEffect(() => {
    if (
      submitted.current &&
      !editPending &&
      !settlePending &&
      !editState.error &&
      !settleState.error
    ) {
      onClose();
    }
  }, [editPending, settlePending, editState, settleState, onClose]);

  return (
    <Modal title={row.name} onClose={onClose}>
      {!isBudget && (
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={`rounded px-3 py-1 text-sm ${
              mode === "edit" ? "bg-slate-900 text-white" : "border border-slate-300"
            }`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode("settle")}
            className={`rounded px-3 py-1 text-sm ${
              mode === "settle" ? "bg-slate-900 text-white" : "border border-slate-300"
            }`}
          >
            Settle
          </button>
        </div>
      )}

      {isBudget ? (
        <>
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
                className="mt-1 w-full rounded border border-slate-300 p-2"
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
                className="mt-1 w-full rounded border border-slate-300 p-2"
              />
            </div>
            {editState.error && <p className="text-sm text-red-600">{editState.error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-slate-300 px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editPending}
                className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              >
                {editPending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
          <form action={skipBudgetOccurrence} onSubmit={onClose} className="mt-3 border-t border-slate-100 pt-3">
            <input type="hidden" name="sourceId" value={row.sourceId} />
            <input type="hidden" name="originalDate" value={row.originalDate} />
            <button type="submit" className="text-sm text-red-600 underline">
              Skip this occurrence
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
              className="mt-1 w-full rounded border border-slate-300 p-2"
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
              className="mt-1 w-full rounded border border-slate-300 p-2"
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
              className="mt-1 w-full rounded border border-slate-300 p-2"
            />
          </div>
          {editState.error && <p className="text-sm text-red-600">{editState.error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editPending}
              className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
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
          <p className="text-sm text-slate-600">
            Forecasted: {row.dueDate}, {centavosToPesosString(row.amount)} {currency}
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
              className="mt-1 w-full rounded border border-slate-300 p-2"
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
              className="mt-1 w-full rounded border border-slate-300 p-2"
            />
          </div>
          {settleState.error && <p className="text-sm text-red-600">{settleState.error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={settlePending}
              className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
            >
              {settlePending ? "Settling..." : "Settle"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
