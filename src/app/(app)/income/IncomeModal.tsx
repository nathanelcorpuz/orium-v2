"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { DatePicker } from "@/components/DatePicker";
import { centavosToPesosString } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { RecurrencePicker, type RecurrenceValue } from "@/components/recurring/RecurrencePicker";
import type { RecurrenceEndsType, RecurrenceUnit } from "@/lib/engine/types";
import { createIncome, updateIncome, type IncomeActionState } from "./actions";

export type IncomeRow = {
  id: string;
  name: string;
  amount: number;
  start_date: string;
  interval: number;
  unit: RecurrenceUnit;
  weekdays: number[] | null;
  days_of_month: number[] | null;
  ordinal: number | null;
  ordinal_weekday: number | null;
  ends_type: RecurrenceEndsType;
  end_date: string | null;
  occurrence_count: number | null;
  comments: string | null;
  balance_id: string | null;
};

// T71: options for the optional "connected account" dropdown.
export type BalanceOption = { id: string; name: string };

const initialState: IncomeActionState = { error: null };

export function IncomeModal({
  income,
  balances,
  onClose,
  // T115: fired only on a genuine successful save, distinct from onClose
  // (which also fires on Cancel/X). NOTE: proved unreliable for the wizard
  // - see BalanceModal.tsx's matching comment for why. The wizard uses
  // `createActionOverride` instead.
  onSaved,
  createActionOverride,
}: {
  income: IncomeRow | null;
  balances: BalanceOption[];
  onClose: () => void;
  onSaved?: () => void;
  createActionOverride?: typeof createIncome;
}) {
  const isEdit = income !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateIncome : (createActionOverride ?? createIncome),
    initialState,
  );
  const [startDate, setStartDate] = useState(income?.start_date ?? todayInManila());
  const submitted = useRef(false);

  const initialRecurrenceValue: RecurrenceValue | null = income
    ? {
        interval: income.interval,
        unit: income.unit,
        weekdays: income.weekdays,
        daysOfMonth: income.days_of_month,
        ordinal: income.ordinal,
        ordinalWeekday: income.ordinal_weekday,
        endsType: income.ends_type,
        endDate: income.end_date,
        occurrenceCount: income.occurrence_count,
      }
    : null;

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
      onSaved?.();
    }
  }, [pending, state, onClose, onSaved]);

  return (
    <Modal title={isEdit ? "Edit income" : "Add income"} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        {isEdit && <input type="hidden" name="id" value={income.id} />}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={income?.name}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
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
            defaultValue={income ? centavosToPesosString(income.amount) : undefined}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="startDate">
            Start date
          </label>
          <DatePicker
            id="startDate"
            name="startDate"
            required
            value={startDate}
            onChange={setStartDate}
            // T107: only a brand-new income item can't start in the past.
            min={isEdit ? undefined : todayInManila()}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
          />
        </div>
        <RecurrencePicker startDate={startDate} initialValue={initialRecurrenceValue} />
        <div>
          <label className="block text-sm text-slate-600" htmlFor="balanceId">
            Added to (optional)
          </label>
          <select
            id="balanceId"
            name="balanceId"
            defaultValue={income?.balance_id ?? ""}
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
            defaultValue={income?.comments ?? ""}
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
