"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { blockNegativeKey } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { addFunds, moveBudgetFunds, takeFunds, type BudgetActionState } from "./actions";
import type { BudgetRow } from "./BudgetModal";

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
  onClose,
}: {
  mode: "add" | "take" | "move";
  budgetId: string;
  budgetName: string;
  // Only needed for move mode - the list of other budgets to move funds to.
  budgets?: BudgetRow[];
  onClose: () => void;
}) {
  const action = mode === "add" ? addFunds : mode === "take" ? takeFunds : moveBudgetFunds;
  const [state, formAction, pending] = useActionState(action, initialState);
  const submitted = useRef(false);
  const otherBudgets = (budgets ?? []).filter((budget) => budget.id !== budgetId);
  const [toBudgetId, setToBudgetId] = useState(otherBudgets[0]?.id ?? "");

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
          </>
        ) : (
          <>
            <input type="hidden" name="budgetId" value={budgetId} />
            <input type="hidden" name="budgetName" value={budgetName} />
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
