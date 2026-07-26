"use client";

import { useActionState, useEffect, useRef } from "react";
import { Modal } from "@/components/Modal";
import { FormTip } from "@/components/FormTip";
import { centavosToPesosString, formatCentavos } from "@/lib/money";
import { createBalance, updateBalance, disconnectItem, type BalanceActionState } from "./actions";
import type { ConnectedItem } from "./BalancesClient";

export type BalanceRow = {
  id: string;
  name: string;
  amount: number;
  comments: string | null;
};

const initialState: BalanceActionState = { error: null };

export function BalanceModal({
  balance,
  // Optional: the Forecast page also opens this modal (for a quick balance
  // edit from its balance chips) without fetching connected-items data -
  // the section below simply doesn't render there. The Balances page always
  // passes the real list.
  connectedItems = [],
  onClose,
  // T115: fired only on a genuine successful save, distinct from onClose
  // (which also fires on Cancel/X). NOTE: proved unreliable for the
  // required onboarding wizard's own purposes - createBalance's own
  // revalidatePath call can cause Next.js to refresh/remount this
  // component before its pending->resolved transition is ever observed,
  // so a save can complete with this never firing. Left in place since it
  // still fires in the common case; the wizard uses `createActionOverride`
  // below instead, which marks success server-side, atomically with the
  // create - immune to that race.
  onSaved,
  // T115: lets the required onboarding wizard swap in a wrapper action
  // that does everything createBalance does plus marks the wizard step
  // "just saved" in the same request - see `onSaved`'s note above for why.
  createActionOverride,
}: {
  balance: BalanceRow | null;
  connectedItems?: ConnectedItem[];
  onClose: () => void;
  onSaved?: () => void;
  createActionOverride?: typeof createBalance;
}) {
  const isEdit = balance !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateBalance : (createActionOverride ?? createBalance),
    initialState,
  );
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
      onSaved?.();
    }
  }, [pending, state, onClose, onSaved]);

  return (
    <Modal title={isEdit ? "Edit account" : "Add account"} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        {isEdit && <input type="hidden" name="id" value={balance.id} />}
        {!isEdit && (
          <FormTip tipKey="account-intro" variant="panel">
            An account is anywhere you actually keep money - a bank account, an e-wallet, or cash
            on hand. Their combined total is the starting point your whole forecast builds from.
          </FormTip>
        )}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={balance?.name}
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
            required
            defaultValue={balance ? centavosToPesosString(balance.amount) : undefined}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
          <FormTip tipKey="account-amount">
            What&rsquo;s in it right now. From here on Orium keeps it up to date for you each time
            you settle a bill or income connected to this account.
          </FormTip>
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="comments">
            Comments
          </label>
          <textarea
            id="comments"
            name="comments"
            defaultValue={balance?.comments ?? ""}
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

      {isEdit && (
        <div className="mt-6 border-t border-notion-hairline pt-4">
          <p className="mb-2 text-sm font-medium text-notion-text">Connected items</p>
          {connectedItems.length === 0 ? (
            <p className="text-sm text-slate-400">No bills, income, debt, savings, or extras point here.</p>
          ) : (
            <ul className="space-y-1">
              {connectedItems.map((item) => (
                <li
                  key={`${item.sourceType}-${item.id}`}
                  className="flex items-center justify-between text-sm text-notion-text"
                >
                  <span>
                    {item.name}{" "}
                    <span className="text-slate-400">
                      ({item.type}, {formatCentavos(Math.abs(item.amount))})
                    </span>
                  </span>
                  <form action={disconnectItem}>
                    <input type="hidden" name="sourceType" value={item.sourceType} />
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="text-xs text-red-600 underline">
                      Disconnect
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
