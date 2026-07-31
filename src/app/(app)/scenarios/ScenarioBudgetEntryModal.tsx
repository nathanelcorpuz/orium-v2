"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { DatePicker } from "@/components/DatePicker";
import { blockNegativeKey, centavosToPesosString } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import {
  createScenarioBudgetEntry,
  updateScenarioBudgetEntry,
  type ScenarioActionState,
} from "./actions";

export type ScenarioBudgetEntryRow = {
  id: string;
  entry_date: string;
  amount: number;
  direction: "incoming" | "outgoing";
  note: string | null;
};

const initialState: ScenarioActionState = { error: null };

// T182: mirrors ScenarioOneOffModal's own shape (one modal, direction as a
// radio pair) - a scenario budget entry is money in or out of the budget's
// hypothetical pot, the same "in/out" concept a scenario misc item already
// uses, not the real Budgets page's richer Log spend/Add funds/Take funds
// split (see migration 0037's own comment for why).
export function ScenarioBudgetEntryModal({
  scenarioId,
  scenarioBudgetId,
  entry,
  onClose,
}: {
  scenarioId: string;
  scenarioBudgetId: string;
  entry: ScenarioBudgetEntryRow | null;
  onClose: () => void;
}) {
  const isEdit = entry !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateScenarioBudgetEntry : createScenarioBudgetEntry,
    initialState,
  );
  const [direction, setDirection] = useState<"incoming" | "outgoing">(entry?.direction ?? "incoming");
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) onClose();
  }, [pending, state, onClose]);

  return (
    <Modal title={isEdit ? "Edit entry" : "Add entry"} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        <input type="hidden" name="scenarioId" value={scenarioId} />
        {isEdit ? (
          <input type="hidden" name="id" value={entry.id} />
        ) : (
          <input type="hidden" name="scenarioBudgetId" value={scenarioBudgetId} />
        )}
        <fieldset>
          <legend className="block text-sm text-slate-600">Direction</legend>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:gap-4">
            <label className="flex items-center gap-1 text-sm text-notion-text">
              <input
                type="radio"
                name="direction"
                value="incoming"
                checked={direction === "incoming"}
                onChange={() => setDirection("incoming")}
              />
              Money in
            </label>
            <label className="flex items-center gap-1 text-sm text-notion-text">
              <input
                type="radio"
                name="direction"
                value="outgoing"
                checked={direction === "outgoing"}
                onChange={() => setDirection("outgoing")}
              />
              Money out
            </label>
          </div>
        </fieldset>
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
            defaultValue={entry ? centavosToPesosString(entry.amount) : undefined}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="entryDate">
            Date
          </label>
          {/* T174/T182: no `min` restriction - a scenario entry's date is
              allowed in the past, same reasoning as every other scenario item. */}
          <DatePicker
            id="entryDate"
            name="entryDate"
            required
            defaultValue={entry?.entry_date ?? todayInManila()}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="note">
            Note (optional)
          </label>
          <input
            id="note"
            name="note"
            type="text"
            defaultValue={entry?.note ?? ""}
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
