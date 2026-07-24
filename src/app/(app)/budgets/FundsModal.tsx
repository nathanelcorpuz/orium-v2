"use client";

import { useActionState, useEffect, useRef } from "react";
import { Modal } from "@/components/Modal";
import { todayInManila } from "@/lib/date";
import { addFunds, takeFunds, type BudgetActionState } from "./actions";

const initialState: BudgetActionState = { error: null };

// T75: Add funds and Take funds pulled out of BudgetCard.tsx's always-inline
// layout into their own modal, opened from the card's button row. One
// component for both (rather than two near-identical files) since the only
// difference is which action fires and the button's label/color.
export function FundsModal({
  mode,
  budgetId,
  budgetName,
  onClose,
}: {
  mode: "add" | "take";
  budgetId: string;
  budgetName: string;
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

  return (
    <Modal title={`${budgetName} — ${title}`} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        <input type="hidden" name="budgetId" value={budgetId} />
        <input type="hidden" name="budgetName" value={budgetName} />
        <input type="hidden" name="entryDate" value={todayInManila()} />
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
            className={`rounded px-4 py-2 text-white hover:opacity-90 disabled:opacity-50 ${
              mode === "add" ? "bg-green-700" : "bg-red-600"
            }`}
          >
            {pending ? "Saving..." : title}
          </button>
        </div>
      </form>
    </Modal>
  );
}
