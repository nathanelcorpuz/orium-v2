"use client";

import { useActionState, useEffect, useRef } from "react";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { FormTip } from "@/components/FormTip";
import { centavosToPesosString, formatCentavos } from "@/lib/money";
import { createBalance, updateBalance, disconnectItem, type BalanceActionState } from "./actions";
import type { ConnectedItem } from "@/lib/connectedItems";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/forecastLabels";

// T179: connected items grouped by type rather than one flat list, in this
// fixed order (matches the sidebar's own Bills/Income/Debt/Savings/Misc
// order) - a "which of my bills point here?" question reads faster grouped
// than scanning a mixed list for the right label. Budgets never appear here
// (T71 only ever links recurring_items/one_off_items to a balance).
const GROUP_ORDER: ConnectedItem["type"][] = ["bill", "income", "debt", "savings", "extra"];

function groupConnectedItems(items: ConnectedItem[]) {
  const byType = new Map<string, ConnectedItem[]>();
  for (const item of items) {
    const list = byType.get(item.type) ?? [];
    list.push(item);
    byType.set(item.type, list);
  }
  return GROUP_ORDER.map((type) => ({ type, items: byType.get(type) ?? [] })).filter(
    (group) => group.items.length > 0,
  );
}

export type BalanceRow = {
  id: string;
  name: string;
  amount: number;
  comments: string | null;
  // T172: flat fee (centavos, >= 0) auto-deducted from every forecasted
  // transaction connected to this account. Optional so a caller that hasn't
  // fetched it (there are none left, but matching every other optional-DB-
  // column convention in this app) doesn't need a literal 0 everywhere.
  transaction_fee_centavos?: number;
};

const initialState: BalanceActionState = { error: null };

export function BalanceModal({
  balance,
  // Both pages that open this modal now pass a real list: the Balances page
  // and, since T152 (Bug #12), the Forecast page's balance chips. The Forecast
  // page used to omit it, which meant an account opened from there silently
  // showed no connections at all. The default stays only so an account with
  // genuinely nothing linked renders the same as before.
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
        {isEdit ? (
          // T186: no longer an editable field here - changing an existing
          // account's balance now always goes through Add/Take/Move funds
          // (their own buttons on the Balances page), so every change is
          // logged with a date and an optional comment instead of silently
          // overwritten.
          <div>
            <p className="block text-sm text-slate-600">Amount</p>
            <p className="mt-1 text-notion-text">{formatCentavos(balance.amount)}</p>
            <FormTip tipKey="account-amount">
              Use Add funds, Take funds, or Move funds on the Balances page to change this - each
              one keeps a dated, commentable record instead of silently overwriting it.
            </FormTip>
          </div>
        ) : (
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
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
            <FormTip tipKey="account-amount">
              What&rsquo;s in it right now. From here on, use Add/Take/Move funds on the Balances
              page to keep it up to date - each one keeps a dated, commentable record.
            </FormTip>
          </div>
        )}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="transactionFeePesos">
            Transaction fee (₱, optional)
          </label>
          <input
            id="transactionFeePesos"
            name="transactionFeePesos"
            type="number"
            step="0.01"
            min="0"
            defaultValue={
              balance?.transaction_fee_centavos ? centavosToPesosString(balance.transaction_fee_centavos) : ""
            }
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
          <FormTip tipKey="account-fee">
            A flat cost auto-deducted from every forecasted transaction connected to this
            account, incoming or outgoing - e.g. a bank that charges a fee per transaction. Leave
            blank for none.
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
          <p className="mb-2 text-sm font-medium text-notion-text">
            Connected items
            {connectedItems.length > 0 && (
              <span className="ml-1 font-normal text-slate-400">({connectedItems.length})</span>
            )}
          </p>
          {connectedItems.length === 0 ? (
            <p className="text-sm text-slate-400">No bills, income, debt, savings, or extras point here.</p>
          ) : (
            <div className="space-y-3">
              {groupConnectedItems(connectedItems).map((group) => {
                const colorClass = TYPE_COLOR[group.type as keyof typeof TYPE_COLOR] ?? "text-notion-text";
                const label = TYPE_LABEL[group.type as keyof typeof TYPE_LABEL] ?? group.type;
                return (
                  <div key={group.type}>
                    <p className={`mb-1 text-xs font-semibold capitalize ${colorClass}`}>
                      {label} ({group.items.length})
                    </p>
                    <ul className="space-y-1 border-l-2 border-notion-hairline pl-2">
                      {group.items.map((item) => (
                        <li
                          key={`${item.sourceType}-${item.id}`}
                          className="flex items-center justify-between gap-2 text-sm text-notion-text"
                        >
                          <span className="min-w-0 truncate">{item.name}</span>
                          <span className={`shrink-0 ${colorClass}`}>
                            {formatCentavos(Math.abs(item.amount))}
                          </span>
                          <form action={disconnectItem} className="shrink-0">
                            <input type="hidden" name="sourceType" value={item.sourceType} />
                            <input type="hidden" name="id" value={item.id} />
                            <SubmitButton
                              className="text-xs text-red-600 underline hover:text-red-700 disabled:opacity-50"
                              spinnerClassName="h-3 w-3"
                            >
                              Disconnect
                            </SubmitButton>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
