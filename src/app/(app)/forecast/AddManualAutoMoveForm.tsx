"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { blockNegativeKey } from "@/lib/money";
import { addManualIncomeAutoMove, type ForecastActionState } from "./actions";

const initialState: ForecastActionState = { error: null };

// SPEC.md T243 (user request 2026-08-08): "allow me to add an auto move
// manually in any future income transaction, even if it is not set in
// income page... a manual auto move to a different account not connected to
// the original setup of the income, only for that certain instance." A
// small, self-contained form (same pattern as AutoMoveRow.tsx) rendered
// inline in EditSettleModal's Auto-moves section - the destination doesn't
// need to be one of the income's own standing income_auto_moves rules, so
// every other account is offered, including the income's own connected
// account's exclusion being the only restriction (moving to itself is a
// no-op).
export function AddManualAutoMoveForm({
  incomeId,
  incomeName,
  originalDate,
  balances,
  excludeBalanceId,
  onClose,
}: {
  incomeId: string;
  incomeName: string;
  originalDate: string;
  balances: { id: string; name: string }[];
  excludeBalanceId?: string | null;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(addManualIncomeAutoMove, initialState);
  const submitted = useRef(false);
  const options = balances.filter((b) => b.id !== excludeBalanceId);
  const [destinationBalanceId, setDestinationBalanceId] = useState(options[0]?.id ?? "");

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
    }
  }, [pending, state, onClose]);

  return (
    <form
      action={formAction}
      onSubmit={() => {
        submitted.current = true;
      }}
      className="space-y-2 rounded border border-notion-hairline bg-white p-2"
    >
      <input type="hidden" name="incomeId" value={incomeId} />
      <input type="hidden" name="incomeName" value={incomeName} />
      <input type="hidden" name="originalDate" value={originalDate} />
      <p className="text-xs text-slate-500">
        Move part of this one occurrence to an account not already set up for {incomeName}.
      </p>
      {options.length === 0 ? (
        <p className="text-xs text-slate-400">No other accounts to move funds to yet.</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <label className="block text-xs text-slate-600" htmlFor="manual-destination">
              To
            </label>
            <select
              id="manual-destination"
              name="destinationBalanceId"
              value={destinationBalanceId}
              onChange={(event) => setDestinationBalanceId(event.target.value)}
              required
              className="mt-1 w-full rounded border border-notion-hairline p-1.5 text-sm text-notion-text focus:border-notion-accent focus:outline-none"
            >
              {options.map((balance) => (
                <option key={balance.id} value={balance.id}>
                  {balance.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-slate-600" htmlFor="manual-amount">
              Amount
            </label>
            <input
              id="manual-amount"
              name="amountPesos"
              type="number"
              step="0.01"
              min="0"
              required
              onKeyDown={blockNegativeKey}
              className="mt-1 w-full rounded border border-notion-hairline p-1.5 text-sm text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
        </div>
      )}
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-notion-hairline px-3 py-1 text-xs text-notion-text hover:bg-notion-hover"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || options.length === 0}
          className="rounded bg-notion-text px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Adding..." : "Add"}
        </button>
      </div>
    </form>
  );
}
