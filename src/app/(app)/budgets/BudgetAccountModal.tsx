"use client";

import { useActionState, useEffect, useRef } from "react";
import { Modal } from "@/components/Modal";
import { centavosToPesosString } from "@/lib/money";
import { createBudgetAccount, updateBudgetAccount, type BudgetActionState } from "./actions";

// T204 (user request 2026-08-01): "another set of accounts that will be
// used as storage for the budgets" - a budget account's own create/edit
// form. Deliberately no separate Add/Take/Move funds UI here (see actions.ts's
// own comment) - `amount` stays a plain editable field, the same shape the
// Balances page's own form had before T186 added its own Add/Take/Move.
export type BudgetAccountRow = {
  id: string;
  name: string;
  amount: number;
  comments: string | null;
};

const initialState: BudgetActionState = { error: null };

export function BudgetAccountModal({
  account,
  onClose,
}: {
  account: BudgetAccountRow | null;
  onClose: () => void;
}) {
  const isEdit = account !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateBudgetAccount : createBudgetAccount,
    initialState,
  );
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
    }
  }, [pending, state, onClose]);

  return (
    <Modal title={isEdit ? "Edit budget account" : "Add budget account"} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        {isEdit && <input type="hidden" name="id" value={account.id} />}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={account?.name}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
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
            defaultValue={account ? centavosToPesosString(account.amount) : undefined}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
          <p className="mt-1 text-sm text-slate-400">
            {isEdit
              ? "Adjust this directly if it's ever out of sync with what's really there."
              : "How much is in this account to start."}
          </p>
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="comments">
            Comments (optional)
          </label>
          <input
            id="comments"
            name="comments"
            type="text"
            defaultValue={account?.comments ?? ""}
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
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
