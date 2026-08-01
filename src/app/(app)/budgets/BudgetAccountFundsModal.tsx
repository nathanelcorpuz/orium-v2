"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { blockNegativeKey } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import {
  addBudgetAccountFunds,
  moveBudgetAccountFunds,
  takeBudgetAccountFunds,
  type BudgetActionState,
} from "./actions";
import type { BudgetAccountRow } from "./BudgetAccountModal";

const initialState: BudgetActionState = { error: null };

// T209 (user follow-up to T204): Add funds / Take funds / Move funds for
// budget accounts, mirroring Accounts' own AccountFundsModal.tsx (T186)
// almost exactly - same three modes, same logged-with-a-comment shape, just
// against budget_accounts instead of balances.
export function BudgetAccountFundsModal({
  mode,
  account,
  accounts,
  onClose,
}: {
  mode: "add" | "take" | "move";
  account: BudgetAccountRow;
  accounts: BudgetAccountRow[];
  onClose: () => void;
}) {
  const action =
    mode === "add" ? addBudgetAccountFunds : mode === "take" ? takeBudgetAccountFunds : moveBudgetAccountFunds;
  const [state, formAction, pending] = useActionState(action, initialState);
  const submitted = useRef(false);
  const otherAccounts = accounts.filter((a) => a.id !== account.id);
  const [toAccountId, setToAccountId] = useState(otherAccounts[0]?.id ?? "");

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
    }
  }, [pending, state, onClose]);

  const title = mode === "add" ? "Add funds" : mode === "take" ? "Take funds" : "Move funds";
  const buttonColor = mode === "add" ? "bg-green-700" : mode === "take" ? "bg-red-600" : "bg-notion-accent";

  return (
    <Modal title={`${account.name} - ${title}`} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        <input type="hidden" name="entryDate" value={todayInManila()} />
        {mode === "move" ? (
          <>
            <input type="hidden" name="fromBudgetAccountId" value={account.id} />
            <input type="hidden" name="fromBudgetAccountName" value={account.name} />
            <input type="hidden" name="toBudgetAccountId" value={toAccountId} />
            <input
              type="hidden"
              name="toBudgetAccountName"
              value={otherAccounts.find((a) => a.id === toAccountId)?.name ?? ""}
            />
            <div>
              <label className="block text-sm text-slate-600" htmlFor="toBudgetAccountSelect">
                Move to
              </label>
              <select
                id="toBudgetAccountSelect"
                value={toAccountId}
                onChange={(event) => setToAccountId(event.target.value)}
                required
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
              >
                {otherAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <input type="hidden" name="budgetAccountId" value={account.id} />
            <input type="hidden" name="budgetAccountName" value={account.name} />
          </>
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
          <label className="block text-sm text-slate-600" htmlFor="note">
            Comment (optional)
          </label>
          <input
            id="note"
            name="note"
            type="text"
            placeholder={mode === "move" ? "Defaults to “Moved to/from…”" : ""}
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
            disabled={pending || (mode === "move" && !toAccountId)}
            className={`rounded px-4 py-2 text-white hover:opacity-90 disabled:opacity-50 ${buttonColor}`}
          >
            {pending ? "Saving..." : title}
          </button>
        </div>
      </form>
    </Modal>
  );
}
