"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { FormTip } from "@/components/FormTip";
import { DatePicker } from "@/components/DatePicker";
import { blockNegativeKey, centavosToPesosString } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import type { RecurringItemActionState } from "@/lib/recurringItem";
import { RecurrencePicker, type RecurrenceValue } from "./RecurrencePicker";
import type { MonthlyGoalRow } from "./MonthlyGoalRow";

const initialState: RecurringItemActionState = { error: null };

type GoalAction = (
  prevState: RecurringItemActionState,
  formData: FormData,
) => Promise<RecurringItemActionState>;

// T71: options for the optional "connected account" dropdown.
export type BalanceOption = { id: string; name: string };

export function MonthlyGoalModal({
  item,
  noun,
  amountLabel,
  balances,
  createAction,
  updateAction,
  onClose,
  // T115: fired only on a genuine successful save, distinct from onClose
  // (which also fires on Cancel/X) - the required onboarding wizard uses
  // this to advance a required step only when something was actually saved.
  onSaved,
}: {
  item: MonthlyGoalRow | null;
  noun: string;
  amountLabel: string;
  balances: BalanceOption[];
  createAction: GoalAction;
  updateAction: GoalAction;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const isEdit = item !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateAction : createAction,
    initialState,
  );
  const [startDate, setStartDate] = useState(item?.start_date ?? todayInManila());
  const submitted = useRef(false);

  const initialRecurrenceValue: RecurrenceValue | null = item
    ? {
        interval: item.interval,
        unit: item.unit,
        weekdays: item.weekdays,
        daysOfMonth: item.days_of_month,
        ordinal: item.ordinal,
        ordinalWeekday: item.ordinal_weekday,
        endsType: item.ends_type,
        endDate: item.end_date,
        occurrenceCount: item.occurrence_count,
      }
    : null;

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
      onSaved?.();
    }
  }, [pending, state, onClose, onSaved]);

  return (
    <Modal title={isEdit ? `Edit ${noun}` : `Add ${noun}`} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        {isEdit && <input type="hidden" name="id" value={item.id} />}
        {/* T120: Debt and Savings share this component, so the intro is
            keyed off `noun` (the only thing that already distinguishes
            them here) rather than adding a second prop just for copy. */}
        {!isEdit && (
          <FormTip tipKey={`${noun === "debt" ? "debt" : "savings"}-intro`} variant="panel">
            {noun === "debt"
              ? "A debt is something you're paying down on a schedule - a loan, a credit card plan. Orium tracks what's left and shows the date you'll be clear of it."
              : "A savings goal is money you set aside on a schedule. Orium reserves each contribution in your forecast, so the balance you see is what's genuinely free to spend."}
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
            defaultValue={item?.name}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="amountPesos">
            {amountLabel}
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
          <FormTip tipKey={`${noun === "debt" ? "debt" : "savings"}-amount`}>
            The amount of one {noun === "debt" ? "payment" : "contribution"}, not the total.
          </FormTip>
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
            // T107: only a brand-new debt/savings item can't start in the past.
            min={isEdit ? undefined : todayInManila()}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
          />
        </div>
        {/* T72: debt/savings must always have a finite end, so their total
            occurrence count is computable for the progress bar - unlike
            other recurring types, which keep "Never" (T85). */}
        <RecurrencePicker startDate={startDate} initialValue={initialRecurrenceValue} allowNever={false} />
        <FormTip tipKey={`${noun === "debt" ? "debt" : "savings"}-ends`}>
          {noun === "debt" ? "Debt" : "Savings"} needs a definite end - a final payment count or
          date - so Orium can show you real progress toward{" "}
          {noun === "debt" ? "being debt-free" : "hitting the goal"}.
        </FormTip>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="balanceId">
            Deducted from (optional)
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
          <FormTip tipKey={`${noun === "debt" ? "debt" : "savings"}-account`}>
            Connect an account and settling each {noun === "debt" ? "payment" : "contribution"}
            {" "}automatically subtracts it from that account&rsquo;s balance, so you never have to
            update it by hand.
          </FormTip>
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
