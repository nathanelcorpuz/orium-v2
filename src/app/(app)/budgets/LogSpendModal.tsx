"use client";

import { useActionState, useEffect, useRef } from "react";
import { Modal } from "@/components/Modal";
import { DatePicker } from "@/components/DatePicker";
import { blockNegativeKey } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { logSpend, type BudgetActionState } from "./actions";

const initialState: BudgetActionState = { error: null };

// T75: the Log spend form pulled out of BudgetCard.tsx's always-inline
// layout into its own modal, opened from the card's button row.
export function LogSpendModal({
  budgetId,
  budgetName,
  accounts,
  onClose,
}: {
  budgetId: string;
  budgetName: string;
  // T218: every budget account connected to this budget. 0/1: no picker
  // (auto or nothing, same as before T218). 2+: a required picker below.
  accounts: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(logSpend, initialState);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
    }
  }, [pending, state, onClose]);

  return (
    <Modal title={`${budgetName} - Log spend`} onClose={onClose}>
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
            connected account is used automatically, same as before T218.
            T284: field renamed to `balanceId` to match writeLedgerEntry's
            own form field (budgets/actions.ts) - a connected account is now
            just a regular `balances` row. */}
        {accounts.length > 1 && (
          <div>
            <label className="block text-sm text-slate-600" htmlFor="balanceId">
              Account
            </label>
            <select
              id="balanceId"
              name="balanceId"
              required
              defaultValue=""
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            >
              <option value="" disabled>
                Choose which account this spend comes from…
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
        <div>
          <label className="block text-sm text-slate-600" htmlFor="entryDate">
            Date
          </label>
          <DatePicker
            id="entryDate"
            name="entryDate"
            defaultValue={todayInManila()}
            required
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
            className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Logging..." : "Log spend"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
