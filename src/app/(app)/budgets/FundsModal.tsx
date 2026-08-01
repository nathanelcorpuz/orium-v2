"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { blockNegativeKey, formatCentavos, parseCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { splitAmountByShares } from "@/lib/budgetSplit";
import { addFunds, moveBudgetFunds, takeFunds, type BudgetActionState } from "./actions";
import type { BudgetRow } from "./BudgetModal";
import type { BudgetAccountRow } from "./BudgetAccountModal";

const initialState: BudgetActionState = { error: null };

// T75: Add funds and Take funds pulled out of BudgetCard.tsx's always-inline
// layout into their own modal, opened from the card's button row. One
// component for both (rather than two near-identical files) since the only
// difference is which action fires and the button's label/color.
// T203 (user request): "move funds in budgets as well" - a third mode added
// the same way BudgetAccountFundsModal.tsx (T209) already does it, moving
// money from this budget to another one the user picks.
export function FundsModal({
  mode,
  budgetId,
  budgetName,
  budgets,
  accounts,
  budgetAccounts,
  accountLinksByBudgetId,
  onClose,
}: {
  mode: "add" | "take" | "move";
  budgetId: string;
  budgetName: string;
  // Only needed for move mode - the list of other budgets to move funds to.
  budgets?: BudgetRow[];
  // T218: every budget account connected to this budget - used for add/take
  // (a real picked-transaction).
  accounts: { id: string; name: string }[];
  // T218 follow-up (REMINDER, 2026-08-02): move mode needs to resolve the
  // *destination* budget's own connected accounts live, as the user picks a
  // different one - not just this budget's own `accounts` above.
  budgetAccounts?: BudgetAccountRow[];
  accountLinksByBudgetId?: Record<string, { budgetAccountId: string; replenishAmount: number }[]>;
  onClose: () => void;
}) {
  const action = mode === "add" ? addFunds : mode === "take" ? takeFunds : moveBudgetFunds;
  const [state, formAction, pending] = useActionState(action, initialState);
  const submitted = useRef(false);
  const otherBudgets = (budgets ?? []).filter((budget) => budget.id !== budgetId);
  const [toBudgetId, setToBudgetId] = useState(otherBudgets[0]?.id ?? "");
  const [amountPesos, setAmountPesos] = useState("");

  // T218 follow-up: resolves the chosen destination budget's connected
  // accounts to real names/shares, so the modal can state where the money
  // actually lands - a single account is used outright, 2+ split
  // proportionally by their configured shares (same logic the automatic
  // replenish path uses, splitAmountByShares).
  const toBudgetAccounts = (accountLinksByBudgetId?.[toBudgetId] ?? [])
    .map((link) => ({
      replenishAmount: link.replenishAmount,
      name: budgetAccounts?.find((account) => account.id === link.budgetAccountId)?.name,
    }))
    .filter((link): link is { replenishAmount: number; name: string } => link.name !== undefined);
  const amountCentavos = parseCentavos(amountPesos) ?? 0;
  const splitPreview =
    toBudgetAccounts.length > 1
      ? splitAmountByShares(amountCentavos, toBudgetAccounts.map((account) => account.replenishAmount))
      : [];

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
    }
  }, [pending, state, onClose]);

  const title = mode === "add" ? "Add funds" : mode === "take" ? "Take funds" : "Move funds";
  const buttonColor = mode === "add" ? "bg-green-700" : mode === "take" ? "bg-red-600" : "bg-notion-accent";

  return (
    <Modal title={`${budgetName} - ${title}`} onClose={onClose}>
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
            <input type="hidden" name="fromBudgetId" value={budgetId} />
            <input type="hidden" name="fromBudgetName" value={budgetName} />
            <input type="hidden" name="toBudgetId" value={toBudgetId} />
            <input
              type="hidden"
              name="toBudgetName"
              value={otherBudgets.find((budget) => budget.id === toBudgetId)?.name ?? ""}
            />
            <div>
              <label className="block text-sm text-slate-600" htmlFor="toBudgetSelect">
                Move to
              </label>
              <select
                id="toBudgetSelect"
                value={toBudgetId}
                onChange={(event) => setToBudgetId(event.target.value)}
                required
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
              >
                {otherBudgets.map((budget) => (
                  <option key={budget.id} value={budget.id}>
                    {budget.name}
                  </option>
                ))}
              </select>
            </div>
            {/* T218 follow-up (REMINDER, 2026-08-02): states where the money
                actually lands on the receiving side, same as the picker
                already does for Log spend/Add/Take funds - a single
                connected account applies outright, 2+ split proportionally
                by their configured shares. */}
            {toBudgetAccounts.length === 1 && (
              <p className="text-sm text-slate-500">
                Also moves {formatCentavos(amountCentavos)} into {toBudgetAccounts[0].name}.
              </p>
            )}
            {toBudgetAccounts.length > 1 && (
              <p className="text-sm text-slate-500">
                Also splits into:{" "}
                {toBudgetAccounts
                  .map((account, index) => `${account.name} ${formatCentavos(splitPreview[index] ?? 0)}`)
                  .join(", ")}
                .
              </p>
            )}
          </>
        ) : (
          <>
            <input type="hidden" name="budgetId" value={budgetId} />
            <input type="hidden" name="budgetName" value={budgetName} />
          </>
        )}
        {/* T218: add/take only - a single connected account is used
            automatically, same as before T218; move has no picker (see
            FundsModal's own prop comment). */}
        {mode !== "move" && accounts.length > 1 && (
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
            value={amountPesos}
            onChange={(event) => setAmountPesos(event.target.value)}
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
            disabled={pending || (mode === "move" && !toBudgetId)}
            className={`rounded px-4 py-2 text-white hover:opacity-90 disabled:opacity-50 ${buttonColor}`}
          >
            {pending ? "Saving..." : title}
          </button>
        </div>
      </form>
    </Modal>
  );
}
