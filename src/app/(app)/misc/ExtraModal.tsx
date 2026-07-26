"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { FormTip } from "@/components/FormTip";
import { DatePicker } from "@/components/DatePicker";
import { centavosToPesosString } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { createExtra, updateExtra, type ExtraActionState } from "./actions";

export type ExtraRow = {
  id: string;
  name: string;
  amount: number;
  due_date: string;
  comments: string | null;
  balance_id: string | null;
};

// T71: options for the optional "connected account" dropdown.
export type BalanceOption = { id: string; name: string };

const initialState: ExtraActionState = { error: null };

export function ExtraModal({
  extra,
  balances,
  onClose,
  // T115: fired only on a genuine successful save, distinct from onClose
  // (which also fires on Cancel/X). NOTE: proved unreliable for the wizard
  // - see BalanceModal.tsx's matching comment for why. The wizard uses
  // `createActionOverride` instead.
  onSaved,
  createActionOverride,
}: {
  extra: ExtraRow | null;
  balances: BalanceOption[];
  onClose: () => void;
  onSaved?: () => void;
  createActionOverride?: typeof createExtra;
}) {
  const isEdit = extra !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateExtra : (createActionOverride ?? createExtra),
    initialState,
  );
  const [direction, setDirection] = useState<"in" | "out">(
    extra && extra.amount < 0 ? "out" : "in",
  );
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
      onSaved?.();
    }
  }, [pending, state, onClose, onSaved]);

  return (
    <Modal title={isEdit ? "Edit misc item" : "Add misc item"} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        {isEdit && <input type="hidden" name="id" value={extra.id} />}
        {!isEdit && (
          <FormTip tipKey="misc-intro" variant="panel">
            Misc is for one-off amounts that don&rsquo;t repeat - a big purchase, a bonus, a gift.
            It lands on your forecast once, on the date you give it.
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
          <DatePicker
            id="dueDate"
            name="dueDate"
            required
            defaultValue={extra?.due_date}
            // T107: only a brand-new misc item can't be due in the past -
            // editing an existing (possibly overdue) one stays unrestricted.
            min={isEdit ? undefined : todayInManila()}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="balanceId">
            {/* T77: extras can go either direction (unlike bills/debt/
                savings, which are always outflows) - the label follows the
                Direction radio above instead of being fixed. */}
            {direction === "in" ? "Added to" : "Deducted from"} (optional)
          </label>
          <select
            id="balanceId"
            name="balanceId"
            defaultValue={extra?.balance_id ?? ""}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          >
            <option value="">No connected account</option>
            {balances.map((balance) => (
              <option key={balance.id} value={balance.id}>
                {balance.name}
              </option>
            ))}
          </select>
          <FormTip tipKey="misc-account">
            Connect an account and settling this automatically{" "}
            {direction === "in" ? "adds it to" : "subtracts it from"} that account&rsquo;s balance,
            so you never have to update it by hand.
          </FormTip>
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
