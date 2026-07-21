"use client";

import { useActionState, useEffect, useRef } from "react";
import { Modal } from "@/components/Modal";
import { centavosToPesosString } from "@/lib/money";
import { createBudget, updateBudget, type BudgetActionState } from "./actions";

export type BudgetRow = {
  id: string;
  name: string;
  monthly_allocation: number;
};

const initialState: BudgetActionState = { error: null };

export function BudgetModal({ budget, onClose }: { budget: BudgetRow | null; onClose: () => void }) {
  const isEdit = budget !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateBudget : createBudget,
    initialState,
  );
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
    }
  }, [pending, state, onClose]);

  return (
    <Modal title={isEdit ? "Edit budget" : "Add budget"} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        {isEdit && <input type="hidden" name="id" value={budget.id} />}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={budget?.name}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="monthlyAllocationPesos">
            Monthly allocation (₱)
          </label>
          <input
            id="monthlyAllocationPesos"
            name="monthlyAllocationPesos"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={budget ? centavosToPesosString(budget.monthly_allocation) : undefined}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
