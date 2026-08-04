"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { FormTip } from "@/components/FormTip";
import { ChevronIcon, CloseIcon } from "@/components/navIcons";
import { centavosToPesosString, formatCentavos } from "@/lib/money";
import { createBalance, updateBalance, disconnectItem, type BalanceActionState } from "./actions";
import { AccountFundsModal } from "./AccountFundsModal";
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
  // User request 2026-08-04: "allow me to move funds in accounts in the
  // forecast page the same as how it works in the accounts page." Add/Take/
  // Move funds now open from here too (real actions, not a preview) rather
  // than only via the Balances page's own row buttons - this modal is
  // already shared by both pages (T152), so adding them here brings full
  // parity in one place instead of duplicating a second UI on the Forecast
  // page. `balances` is only needed for Move funds' "move to" picker -
  // defaults to empty for any caller (e.g. onboarding) that doesn't need it.
  balances = [],
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
  balances?: BalanceRow[];
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
  // Collapse toggle for the connected-items list below - expanded by
  // default (this is why the modal was opened as often as not), and not
  // persisted anywhere since it's a transient per-open preference on a
  // modal that closes and forgets its own state anyway.
  const [connectedItemsOpen, setConnectedItemsOpen] = useState(true);
  // User feedback: disconnecting needs a confirm step, matching the
  // inline-confirm pattern every Delete button in this app already uses
  // (e.g. BillsClient's own confirmingDeleteId), rather than a bare,
  // always-visible "Disconnect" link one accidental click away.
  const [confirmingDisconnectKey, setConfirmingDisconnectKey] = useState<string | null>(null);
  // 2026-08-04: Add/Take/Move funds, reusing the exact same modal/actions
  // the Balances page's own row buttons already use.
  const [fundsMode, setFundsMode] = useState<null | "add" | "take" | "move">(null);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
      onSaved?.();
    }
  }, [pending, state, onClose, onSaved]);

  return (
    <>
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
          // account's balance always goes through Add/Take/Move funds (T186;
          // reachable both from the Balances page's own row buttons and,
          // 2026-08-04, right here) - each one is logged with a date and an
          // optional comment instead of silently overwriting it.
          <div>
            {/* T274 (user request 2026-08-04): "Amount" read as an editable
                field rather than what it actually is - the account's own
                running balance. */}
            <p className="block text-sm text-slate-600">Running balance</p>
            <p className="mt-1 text-notion-text">{formatCentavos(balance.amount)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFundsMode("add")}
                className="rounded border border-notion-hairline px-3 py-1 text-sm text-green-700 hover:bg-green-50"
              >
                Add funds
              </button>
              <button
                type="button"
                onClick={() => setFundsMode("take")}
                className="rounded border border-notion-hairline px-3 py-1 text-sm text-red-600 hover:bg-red-50"
              >
                Take funds
              </button>
              {balances.filter((b) => b.id !== balance.id).length > 0 && (
                <button
                  type="button"
                  onClick={() => setFundsMode("move")}
                  className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-accent hover:bg-notion-hover"
                >
                  Move funds
                </button>
              )}
            </div>
            <FormTip tipKey="account-amount">
              Each one keeps a dated, commentable record instead of silently overwriting it.
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
              What&rsquo;s in it right now. From here on, use Add/Take/Move funds (from this
              account&rsquo;s own Edit screen, on either the Accounts or Forecast page) to keep it
              up to date - each one keeps a dated, commentable record.
            </FormTip>
          </div>
        )}
        <div>
          {/* T281 (user request 2026-08-04): "Default transaction fee" makes
              clear this is a fallback, not a fixed cost - T194/T250 already
              let it be overridden per settlement or per move. */}
          <label className="block text-sm text-slate-600" htmlFor="transactionFeePesos">
            Default transaction fee (₱, optional)
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
          {/* T275 (user request 2026-08-04): make clear up front that this
              isn't locked in - Settle (T194) and Move funds (T250) can both
              override it for one transaction without changing the default. */}
          <FormTip tipKey="account-fee">
            A flat cost auto-deducted from every forecasted transaction connected to this
            account, incoming or outgoing - e.g. a bank that charges a fee per transaction. Leave
            blank for none. You can still override it for a single transaction later, when
            settling or moving funds.
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
          <button
            type="button"
            onClick={() => setConnectedItemsOpen((prev) => !prev)}
            aria-expanded={connectedItemsOpen}
            className="mb-2 flex w-full items-center justify-between text-sm font-medium text-notion-text hover:opacity-80"
          >
            <span>
              Connected items
              {connectedItems.length > 0 && (
                <span className="ml-1 font-normal text-slate-400">({connectedItems.length})</span>
              )}
            </span>
            <ChevronIcon
              direction="right"
              className={`h-3.5 w-3.5 text-slate-400 transition-transform ${connectedItemsOpen ? "rotate-90" : ""}`}
            />
          </button>
          {connectedItemsOpen && connectedItems.length === 0 ? (
            <p className="text-sm text-slate-400">No bills, income, debt, savings, or extras point here.</p>
          ) : connectedItemsOpen ? (
            <div className="space-y-3">
              {groupConnectedItems(connectedItems).map((group) => {
                const colorClass = TYPE_COLOR[group.type as keyof typeof TYPE_COLOR] ?? "text-notion-text";
                const label = TYPE_LABEL[group.type as keyof typeof TYPE_LABEL] ?? group.type;
                return (
                  <div key={group.type}>
                    <p className={`mb-1 text-xs font-semibold capitalize ${colorClass}`}>
                      {label} ({group.items.length})
                    </p>
                    <ul className="divide-y divide-notion-hairline border-l-2 border-notion-hairline pl-2">
                      {group.items.map((item) => {
                        const key = `${item.sourceType}-${item.id}`;
                        const confirming = confirmingDisconnectKey === key;
                        return (
                          <li key={key} className="flex items-center gap-2 py-1.5 text-sm text-notion-text">
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            <span className={`w-24 shrink-0 text-right tabular-nums ${colorClass}`}>
                              {formatCentavos(Math.abs(item.amount))}
                            </span>
                            {confirming ? (
                              <div className="flex shrink-0 items-center gap-1">
                                <span className="text-xs text-slate-500">Disconnect?</span>
                                <form action={disconnectItem}>
                                  <input type="hidden" name="sourceType" value={item.sourceType} />
                                  <input type="hidden" name="id" value={item.id} />
                                  <SubmitButton
                                    className="rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                    spinnerClassName="h-3 w-3"
                                  >
                                    Yes
                                  </SubmitButton>
                                </form>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingDisconnectKey(null)}
                                  className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-notion-hover hover:text-notion-text"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmingDisconnectKey(key)}
                                title="Disconnect from this account"
                                aria-label="Disconnect from this account"
                                className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                              >
                                <CloseIcon className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
    {isEdit && fundsMode && (
      <AccountFundsModal mode={fundsMode} balance={balance} balances={balances} onClose={() => setFundsMode(null)} />
    )}
    </>
  );
}
