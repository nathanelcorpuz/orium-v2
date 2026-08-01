"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { DatePicker } from "@/components/DatePicker";
import { SegmentedControl } from "@/components/SegmentedControl";
import { blockNegativeKey, centavosToPesosString } from "@/lib/money";
import { formatFullDate, todayInManila } from "@/lib/date";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/forecastLabels";
import type { ForecastRow } from "@/lib/engine/types";
import { deleteBudgetEntry, updateBudgetEntry, type BudgetActionState } from "@/app/(app)/budgets/actions";
import {
  editBudgetReplenish,
  editOneOff,
  editRecurringOccurrence,
  resetBudgetReplenish,
  settleBudgetReplenish,
  settleOccurrence,
  type ForecastActionState,
} from "./actions";

const initialState: ForecastActionState = { error: null };
const initialEntryState: BudgetActionState = { error: null };

export function EditSettleModal({
  row,
  currency,
  balances,
  accountBalanceAtRow = null,
  onClose,
}: {
  row: ForecastRow;
  currency: string;
  balances: { id: string; name: string }[];
  // T191 (user request): when this row is actually connected to an account,
  // what that account's own balance will be once this transaction happens -
  // computed by the caller (it needs every account's starting `amount`,
  // which this modal's own `balances` prop deliberately doesn't carry) via
  // `computeAccountBalancesAfterEachRow`/`accountBalanceForRow`
  // (accountBalances.ts). Null covers every case where there's nothing to
  // show: no connected account, or a stale/deleted one.
  accountBalanceAtRow?: number | null;
  onClose: () => void;
}) {
  const connectedAccountName = row.balanceId ? (balances.find((b) => b.id === row.balanceId)?.name ?? null) : null;
  // Future-dated budget entries (SPEC.md T43/T57) are editable directly from
  // the Forecast - a real budget_entries row (spend, replenishment, or
  // manual add/take), not a projected occurrence, so they skip the edit/
  // settle toggle entirely (no Settle equivalent - a ledger entry already
  // *is* the actual transaction) and reuse the existing
  // updateBudgetEntry/deleteBudgetEntry actions from the Budgets page
  // (budgets/actions.ts) rather than new ones, since those already do
  // exactly what's needed here (including revalidating /forecast).
  const isBudgetEntry = row.sourceType === "budget_entry";
  // Phase 11 (T59): a projected replenish occurrence. Was settle-only with no
  // Edit tab, and income-linked ones weren't clickable at all.
  //
  // T168 (user request 2026-07-31) changes both. A projected replenishment is
  // now adjustable per instance - amount and date - via
  // budget_replenish_overrides, extended by migration 0027. Crucially that had
  // to include income-linked budgets: every budget in real use is linked to an
  // income, so an editor that skipped them would have been an editor nobody
  // could reach.
  //
  // Settling stays exactly as scoped: only an own-schedule budget's row can be
  // settled here (`budgetSettleable`). An income-linked one still settles
  // automatically when its income does, so it gets the Edit form alone with no
  // toggle - you can change what it will transfer, not declare it done.
  const isBudgetReplenish = row.sourceType === "budget_replenish";
  const canSettleReplenish = isBudgetReplenish && row.budgetSettleable === true;
  // User request 2026-07-24: the amount field shouldn't require typing a
  // minus sign for outflow types - only "extra" genuinely goes either way
  // (no fixed direction), so it's the one type that keeps manual sign entry.
  const isExtra = row.type === "extra";
  const [mode, setMode] = useState<"edit" | "settle">("edit");
  // T158: the "See more" detail panel, collapsed by default.
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  // T168: editing and resetting a projected replenishment. Separate action
  // states so an error in one never blanks the other's message.
  const [editReplenishState, editReplenishFormAction, editReplenishPending] = useActionState(
    editBudgetReplenish,
    initialState,
  );
  const [resetReplenishState, resetReplenishFormAction, resetReplenishPending] = useActionState(
    resetBudgetReplenish,
    initialState,
  );
  // T134 (stress-test finding, flagged but deliberately left open by T133):
  // this form used to close the modal synchronously via onSubmit={onClose},
  // before deleteBudgetEntry (which used to return void with no error
  // reporting at all) had actually finished - a failed delete gave zero
  // feedback, modal already gone. Now goes through useActionState like
  // every other action in this modal, folded into the same close-on-success
  // effect below instead of closing unconditionally on submit.
  const [deleteEntryState, deleteEntryFormAction, deleteEntryPending] = useActionState(
    deleteBudgetEntry,
    initialEntryState,
  );
  const submitted = useRef(false);

  useEffect(() => {
    if (
      submitted.current &&
      !editPending &&
      !settlePending &&
      !entryPending &&
      !replenishPending &&
      !deleteEntryPending &&
      !editReplenishPending &&
      !resetReplenishPending &&
      !editState.error &&
      !settleState.error &&
      !entryState.error &&
      !replenishState.error &&
      !deleteEntryState.error &&
      !editReplenishState.error &&
      !resetReplenishState.error
    ) {
      onClose();
    }
  }, [
    editPending,
    settlePending,
    entryPending,
    replenishPending,
    deleteEntryPending,
    editReplenishPending,
    resetReplenishPending,
    editState,
    settleState,
    entryState,
    replenishState,
    deleteEntryState,
    editReplenishState,
    resetReplenishState,
    onClose,
  ]);

  return (
    <Modal title={row.name} onClose={onClose}>
      {/* T191 (user request): shown up front, not tucked behind "See more" -
          the whole point is knowing this without an extra click. Only
          renders when there's actually a connected account with something
          to report (see the prop's own comment for the null cases). */}
      {connectedAccountName && accountBalanceAtRow !== null && (
        <p className="mb-4 rounded border border-notion-hairline bg-notion-hover/40 p-2 text-sm text-slate-600">
          <span className="font-medium text-notion-text">{connectedAccountName}</span> will be{" "}
          <span className="font-medium text-notion-text">
            {centavosToPesosString(accountBalanceAtRow)} {currency}
          </span>{" "}
          after this.
        </p>
      )}
      {/* T158: the table shows only name and amount, so everything else about
          a row required opening the underlying record on another page.
          Collapsed by default - this is reference detail, not the reason the
          modal was opened, and expanding it by default would push the actual
          Edit/Settle form below the fold. */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-notion-text"
        >
          {detailsOpen ? "Hide details" : "See more"}
          <span aria-hidden="true">{detailsOpen ? "▾" : "▸"}</span>
        </button>
        {detailsOpen && (
          <dl className="mt-2 space-y-1 rounded border border-notion-hairline bg-notion-hover/40 p-3 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Type</dt>
              <dd className={TYPE_COLOR[row.type]}>{TYPE_LABEL[row.type]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Date</dt>
              <dd className="text-notion-text">{formatFullDate(row.dueDate)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Amount</dt>
              <dd className="text-notion-text">
                {centavosToPesosString(Math.abs(row.amount))} {currency}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Account</dt>
              <dd className="text-notion-text">{connectedAccountName ?? "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Forecasted balance</dt>
              <dd className="text-notion-text">
                {centavosToPesosString(row.runningBalance)} {currency}
              </dd>
            </div>
            {/* T155 threaded this through from the underlying record; without
                it there would be nothing to show here. */}
            {row.comment && (
              <div className="border-t border-notion-hairline pt-1">
                <dt className="text-slate-500">Comment</dt>
                <dd className="mt-0.5 italic text-notion-text">{row.comment}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
      {/* T168: budget_replenish rows get the toggle too, but only when the
          row is genuinely settleable here. An income-linked one shows the
          Edit form alone - offering a Settle tab that refuses to work would
          be worse than not offering it. */}
      {!isBudgetEntry && (!isBudgetReplenish || canSettleReplenish) && (
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

      {isBudgetReplenish && (mode === "edit" || !canSettleReplenish) ? (
        <div className="space-y-4">
          <form
            action={editReplenishFormAction}
            onSubmit={() => {
              submitted.current = true;
            }}
            className="space-y-4"
          >
            <input type="hidden" name="budgetId" value={row.budgetId} />
            <input type="hidden" name="budgetName" value={row.budgetName} />
            <input type="hidden" name="originalDate" value={row.originalDate} />
            <p className="text-sm text-slate-500">
              Adjust this one replenishment. The budget&apos;s allocation and schedule stay as they
              are - only this occurrence changes.
            </p>
            <div>
              <label className="block text-sm text-slate-600" htmlFor="amountPesos">
                Amount ({currency})
              </label>
              <input
                id="amountPesos"
                name="amountPesos"
                type="number"
                step="0.01"
                min="0"
                required
                onKeyDown={blockNegativeKey}
                defaultValue={centavosToPesosString(Math.abs(row.amount))}
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600" htmlFor="date">
                Date
              </label>
              <DatePicker
                id="date"
                name="date"
                required
                defaultValue={row.dueDate}
                min={todayInManila()}
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
              />
            </div>
            {editReplenishState.error && (
              <p className="text-sm text-red-600">{editReplenishState.error}</p>
            )}
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
                disabled={editReplenishPending}
                className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
              >
                {editReplenishPending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>

          {/* Only offered once there is actually an edit to undo - `edited`
              is set by the engine exactly when an override changed this
              occurrence's amount or date. */}
          {row.edited && (
            <form
              action={resetReplenishFormAction}
              onSubmit={() => {
                submitted.current = true;
              }}
              className="border-t border-notion-hairline pt-4"
            >
              <input type="hidden" name="budgetId" value={row.budgetId} />
              <input type="hidden" name="budgetName" value={row.budgetName} />
              <input type="hidden" name="originalDate" value={row.originalDate} />
              {resetReplenishState.error && (
                <p className="mb-2 text-sm text-red-600">{resetReplenishState.error}</p>
              )}
              <button
                type="submit"
                disabled={resetReplenishPending}
                className="text-sm text-slate-500 underline hover:text-notion-text disabled:opacity-50"
              >
                {resetReplenishPending ? "Resetting..." : "Reset to the usual amount and date"}
              </button>
            </form>
          )}
        </div>
      ) : isBudgetReplenish ? (
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
              onKeyDown={blockNegativeKey}
              defaultValue={centavosToPesosString(Math.abs(row.amount))}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="actualDate">
              Actual date
            </label>
            <DatePicker
              id="actualDate"
              name="actualDate"
              required
              defaultValue={row.dueDate}
              // T107: can't settle something that hasn't happened yet.
              max={todayInManila()}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
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
                Amount ({currency}) - {row.amount > 0 ? "incoming" : "outgoing"}
              </label>
              <input
                id="amountPesos"
                name="amountPesos"
                type="number"
                step="0.01"
                min="0"
                required
                onKeyDown={blockNegativeKey}
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
              <DatePicker
                id="entryDate"
                name="entryDate"
                required
                defaultValue={row.dueDate}
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
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
          <form
            action={deleteEntryFormAction}
            onSubmit={() => {
              submitted.current = true;
            }}
            className="mt-3 border-t border-notion-hairline pt-3"
          >
            <input type="hidden" name="id" value={row.sourceId} />
            <button
              type="submit"
              disabled={deleteEntryPending}
              className="text-sm text-red-600 underline hover:text-red-700 disabled:opacity-50"
            >
              {deleteEntryPending ? "Deleting..." : "Delete this entry"}
            </button>
            {deleteEntryState.error && (
              <p className="mt-1 text-sm text-red-600">{deleteEntryState.error}</p>
            )}
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
          <input type="hidden" name="type" value={row.type} />
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
              min={isExtra ? undefined : "0"}
              required
              onKeyDown={isExtra ? undefined : blockNegativeKey}
              defaultValue={centavosToPesosString(isExtra ? row.amount : Math.abs(row.amount))}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="date">
              Date
            </label>
            <DatePicker
              id="date"
              name="date"
              required
              defaultValue={row.dueDate}
              // T107: editing a forecast occurrence can only move it to
              // today or later, never into the past.
              min={todayInManila()}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
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
          {/* T172: the connected account's fee, shown for transparency - the
              user's own request specifically asked for this to be visible
              "in editing/settling a transaction." Already reflected in the
              projected running balance; there is nothing to edit here, it's
              a property of the account, not this occurrence. */}
          {row.feeAmount ? (
            <p className="text-sm text-slate-500">
              Plus a {centavosToPesosString(row.feeAmount)} {currency} account fee
            </p>
          ) : null}
          <div>
            <label className="block text-sm text-slate-600" htmlFor="actualAmountPesos">
              Actual amount ({currency})
            </label>
            <input
              id="actualAmountPesos"
              name="actualAmountPesos"
              type="number"
              step="0.01"
              min={isExtra ? undefined : "0"}
              required
              onKeyDown={isExtra ? undefined : blockNegativeKey}
              defaultValue={centavosToPesosString(isExtra ? row.amount : Math.abs(row.amount))}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="actualDate">
              Actual date
            </label>
            <DatePicker
              id="actualDate"
              name="actualDate"
              required
              defaultValue={row.dueDate}
              // T107: can't settle something that hasn't happened yet.
              max={todayInManila()}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="balanceId">
              {/* T77: same direction-aware label as the CRUD forms - based
                  on the row's own signed amount (not just its type), since
                  an extra can go either way unlike bill/debt/savings/income. */}
              {row.amount > 0 ? "Added to" : "Deducted from"}
            </label>
            <select
              id="balanceId"
              name="balanceId"
              defaultValue={row.balanceId ?? ""}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            >
              <option value="">No account (don&apos;t update a balance)</option>
              {balances.map((balance) => (
                <option key={balance.id} value={balance.id}>
                  {balance.name}
                </option>
              ))}
            </select>
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
