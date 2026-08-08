"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { DatePicker } from "@/components/DatePicker";
import { blockNegativeKey, centavosToPesosString, formatCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import {
  deleteManualIncomeAutoMove,
  editIncomeAutoMove,
  resetIncomeAutoMove,
  type ForecastActionState,
} from "./actions";
import type { ResolvedAutoMove } from "./resolveAutoMoves";

const initialState: ForecastActionState = { error: null };

// SPEC.md T224 (user request 2026-08-02): one editable line per auto-move
// rule attached to the income row being viewed - a small, self-contained
// component (rather than one big form in EditSettleModal) so each rule's
// edit state and useActionState hooks stay independent of every other rule
// on the same income, without violating the rules of hooks by calling them
// inside a loop.
export function AutoMoveRow({
  autoMove,
  originalDate,
  currency,
}: {
  autoMove: ResolvedAutoMove;
  originalDate: string;
  currency: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editFormAction, editPending] = useActionState(editIncomeAutoMove, initialState);
  const [resetState, resetFormAction, resetPending] = useActionState(resetIncomeAutoMove, initialState);
  // T243: always called (rules of hooks), only ever actually used below when
  // `autoMove.manual` is true - a manual entry has no rule to edit/reset, so
  // its own row is delete-only.
  const [deleteState, deleteFormAction, deletePending] = useActionState(deleteManualIncomeAutoMove, initialState);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !editPending && !resetPending && !editState.error && !resetState.error) {
      submitted.current = false;
      setEditing(false);
    }
  }, [editPending, resetPending, editState, resetState]);

  // T243: a manual one-off entry - no rule behind it, so no Edit/skip form,
  // just what it is and a way to undo it entirely.
  if (autoMove.manual) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span>
          {formatCentavos(autoMove.amount, currency)} to{" "}
          <span className="font-medium text-notion-text">{autoMove.destinationName}</span>
          <span className="ml-1 rounded-full bg-notion-hover px-1.5 py-0.5 text-[10px] font-medium text-notion-accent">
            manual
          </span>
        </span>
        <form
          action={deleteFormAction}
          onSubmit={() => {
            submitted.current = true;
          }}
          className="flex shrink-0 items-center gap-2"
        >
          <input type="hidden" name="id" value={autoMove.id} />
          {deleteState.error && <span className="text-xs text-red-600">{deleteState.error}</span>}
          <button
            type="submit"
            disabled={deletePending}
            className="text-xs text-red-600 underline hover:text-red-700 disabled:opacity-50"
          >
            {deletePending ? "Removing..." : "Remove"}
          </button>
        </form>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span>
          {autoMove.skipped ? (
            <span className="text-slate-500">Skipped this date</span>
          ) : (
            <>
              {formatCentavos(autoMove.amount, currency)} to{" "}
              <span className="font-medium text-notion-text">{autoMove.destinationName}</span>
            </>
          )}
          {autoMove.edited && !autoMove.skipped && (
            <span className="ml-1 rounded-full bg-notion-hover px-1.5 py-0.5 text-[10px] font-medium text-notion-accent">
              edited
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 text-xs text-slate-500 underline hover:text-notion-text"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded border border-notion-hairline bg-white p-2">
      <form
        action={editFormAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-2"
      >
        <input type="hidden" name="incomeAutoMoveId" value={autoMove.id} />
        <input type="hidden" name="originalDate" value={originalDate} />
        <p className="text-xs text-slate-500">
          Adjust just this date&apos;s auto-move to {autoMove.destinationName} - the recurring rule stays as it is.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <label className="block text-xs text-slate-600" htmlFor={`amountPesos-${autoMove.id}`}>
              Amount ({currency})
            </label>
            <input
              id={`amountPesos-${autoMove.id}`}
              name="amountPesos"
              type="number"
              step="0.01"
              min="0"
              required
              onKeyDown={blockNegativeKey}
              defaultValue={centavosToPesosString(autoMove.skipped ? 0 : autoMove.amount)}
              className="mt-1 w-full rounded border border-notion-hairline p-1.5 text-sm text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-slate-600" htmlFor={`date-${autoMove.id}`}>
              Date
            </label>
            <DatePicker
              id={`date-${autoMove.id}`}
              name="date"
              required
              defaultValue={autoMove.newDate ?? originalDate}
              min={todayInManila()}
              className="mt-1 w-full rounded border border-notion-hairline p-1.5 text-left text-sm focus:border-notion-accent focus:outline-none"
            />
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" name="skip" defaultChecked={autoMove.skipped} />
          Skip this date entirely
        </label>
        {editState.error && <p className="text-xs text-red-600">{editState.error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded border border-notion-hairline px-3 py-1 text-xs text-notion-text hover:bg-notion-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={editPending}
            className="rounded bg-notion-text px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
          >
            {editPending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
      {(autoMove.edited || autoMove.skipped) && (
        <form
          action={resetFormAction}
          onSubmit={() => {
            submitted.current = true;
          }}
          className="border-t border-notion-hairline pt-2"
        >
          <input type="hidden" name="incomeAutoMoveId" value={autoMove.id} />
          <input type="hidden" name="originalDate" value={originalDate} />
          {resetState.error && <p className="mb-1 text-xs text-red-600">{resetState.error}</p>}
          <button
            type="submit"
            disabled={resetPending}
            className="text-xs text-slate-500 underline hover:text-notion-text disabled:opacity-50"
          >
            {resetPending ? "Resetting..." : "Reset to the usual amount and date"}
          </button>
        </form>
      )}
    </div>
  );
}
