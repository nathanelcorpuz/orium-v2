"use client";

import { useActionState, useEffect, useRef } from "react";
import { Modal } from "@/components/Modal";
import { blockNegativeKey } from "@/lib/money";
import { addFunds, takeFunds, type BudgetActionState } from "./actions";

const initialState: BudgetActionState = { error: null };

// T75: Add funds and Take funds pulled out of BudgetCard.tsx's always-inline
// layout into their own modal, opened from the card's button row. One
// component for both (rather than two near-identical files) since the only
// difference is which action fires and the button's label/color. T203 added
// a "move" mode here too; T222 (user request 2026-08-02) split that back
// out into its own MoveBudgetFundsModal.tsx once it grew a second, genuinely
// different move type (between two of a *single* budget's own accounts) -
// this component is add/take only again.
export function FundsModal({
  mode,
  budgetId,
  budgetName,
  accounts,
  onClose,
}: {
  mode: "add" | "take";
  budgetId: string;
  budgetName: string;
  // T218: every budget account connected to this budget - the picker below
  // only renders once there's a real choice to make.
  accounts: { id: string; name: string }[];
  onClose: () => void;
}) {
  const action = mode === "add" ? addFunds : takeFunds;
  const [state, formAction, pending] = useActionState(action, initialState);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
    }
  }, [pending, state, onClose]);

  const title = mode === "add" ? "Add funds" : "Take funds";
  const buttonColor = mode === "add" ? "bg-green-700" : "bg-red-600";

  return (
    <Modal title={`${budgetName} - ${title}`} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        <input type="hidden" name="budgetId" value={budgetId} />
        <input type="hidden" name="budgetName" value={budgetName} />
        {/* T218: only shown when there's a real choice to make - a single
            connected account is used automatically. */}
        {accounts.length > 1 && (
          <div>
            <label className="block text-sm text-slate-600" htmlFor="budgetAccountId">
              Budget account
            </label>
            <select
              id="budgetAccountId"
              name="budgetAccountId"
              required
              defaultValue=""
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            >
              <option value="" disabled>
                Choose which account this affects…
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="amountPesos">
            Amount (₱)
          </label>
          <input
            id="amountPesos"
            name="amountPesos"
            type="number"
            step="0.01"
            min="0"
            required
            onKeyDown={blockNegativeKey}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        {/* T195 (user request): matches Accounts' own Add/Take/Move funds
            (T186) - the action already reads `note` (writeLedgerEntry,
            budgets/actions.ts), only the field itself was missing here. */}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="note">
            Comment (optional)
          </label>
          <input
            id="note"
            name="note"
            type="text"
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
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
            disabled={pending}
            className={`rounded px-4 py-2 text-white hover:opacity-90 disabled:opacity-50 ${buttonColor}`}
          >
            {pending ? "Saving..." : title}
          </button>
        </div>
      </form>
    </Modal>
  );
}
