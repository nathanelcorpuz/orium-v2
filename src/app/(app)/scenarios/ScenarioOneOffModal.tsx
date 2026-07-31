"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { DatePicker } from "@/components/DatePicker";
import { blockNegativeKey, centavosToPesosString } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import {
  createScenarioOneOff,
  updateScenarioOneOff,
  type ScenarioActionState,
} from "./actions";
import type { BalanceOption } from "./ScenarioItemModal";

// T174: mirrors ExtraModal.tsx's ExtraRow, minus `active` (scenario items are
// deleted, not toggled - see migration 0033's own comment).
export type ScenarioOneOffRow = {
  id: string;
  name: string;
  amount: number;
  due_date: string;
  comments: string | null;
  balance_id: string | null;
};

const initialState: ScenarioActionState = { error: null };

export function ScenarioOneOffModal({
  scenarioId,
  item,
  balances,
  onClose,
}: {
  scenarioId: string;
  item: ScenarioOneOffRow | null;
  balances: BalanceOption[];
  onClose: () => void;
}) {
  const isEdit = item !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateScenarioOneOff : createScenarioOneOff,
    initialState,
  );
  const [direction, setDirection] = useState<"in" | "out">(item && item.amount < 0 ? "out" : "in");
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) onClose();
  }, [pending, state, onClose]);

  return (
    <Modal title={isEdit ? "Edit scenario item" : "Add scenario misc item"} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        <input type="hidden" name="scenarioId" value={scenarioId} />
        {isEdit && <input type="hidden" name="id" value={item.id} />}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={item?.name}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <fieldset>
          <legend className="block text-sm text-slate-600">Direction</legend>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:gap-4">
            <label className="flex items-center gap-1 text-sm text-notion-text">
              <input
                type="radio"
                name="direction"
                value="in"
                checked={direction === "in"}
                onChange={() => setDirection("in")}
              />
              Money in
            </label>
            <label className="flex items-center gap-1 text-sm text-notion-text">
              <input
                type="radio"
                name="direction"
                value="out"
                checked={direction === "out"}
                onChange={() => setDirection("out")}
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
            defaultValue={item ? centavosToPesosString(Math.abs(item.amount)) : undefined}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="dueDate">
            Due date
          </label>
          {/* T174: no `min` restriction - a scenario item's date is allowed
              in the past, same reasoning as ScenarioItemModal. */}
          <DatePicker
            id="dueDate"
            name="dueDate"
            required
            defaultValue={item?.due_date ?? todayInManila()}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="balanceId">
            Connected account (optional)
          </label>
          <select
            id="balanceId"
            name="balanceId"
            defaultValue={item?.balance_id ?? ""}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          >
            <option value="">No connected account</option>
            {balances.map((balance) => (
              <option key={balance.id} value={balance.id}>
                {balance.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="comments">
            Comments
          </label>
          <textarea
            id="comments"
            name="comments"
            defaultValue={item?.comments ?? ""}
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
