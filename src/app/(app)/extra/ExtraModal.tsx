"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { centavosToPesosString } from "@/lib/money";
import { createExtra, updateExtra, type ExtraActionState } from "./actions";

export type ExtraRow = {
  id: string;
  name: string;
  amount: number;
  due_date: string;
  comments: string | null;
};

const initialState: ExtraActionState = { error: null };

export function ExtraModal({ extra, onClose }: { extra: ExtraRow | null; onClose: () => void }) {
  const isEdit = extra !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateExtra : createExtra,
    initialState,
  );
  const [direction, setDirection] = useState<"in" | "out">(
    extra && extra.amount < 0 ? "out" : "in",
  );
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
    }
  }, [pending, state, onClose]);

  return (
    <Modal title={isEdit ? "Edit extra" : "Add extra"} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        {isEdit && <input type="hidden" name="id" value={extra.id} />}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={extra?.name}
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
              Money in (e.g. refund, gift received)
            </label>
            <label className="flex items-center gap-1 text-sm text-notion-text">
              <input
                type="radio"
                name="direction"
                value="out"
                checked={direction === "out"}
                onChange={() => setDirection("out")}
              />
              Money out (e.g. gift given, expense)
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
            defaultValue={extra ? centavosToPesosString(Math.abs(extra.amount)) : undefined}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="dueDate">
            Due date
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            required
            defaultValue={extra?.due_date}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="comments">
            Comments
          </label>
          <textarea
            id="comments"
            name="comments"
            defaultValue={extra?.comments ?? ""}
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
