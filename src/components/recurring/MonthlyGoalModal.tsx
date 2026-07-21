"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { centavosToPesosString } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import type { RecurringItemActionState } from "@/lib/recurringItem";
import { RecurrencePicker, type RecurrenceValue } from "./RecurrencePicker";
import type { MonthlyGoalRow } from "./MonthlyGoalRow";

const initialState: RecurringItemActionState = { error: null };

type GoalAction = (
  prevState: RecurringItemActionState,
  formData: FormData,
) => Promise<RecurringItemActionState>;

export function MonthlyGoalModal({
  item,
  noun,
  amountLabel,
  createAction,
  updateAction,
  onClose,
}: {
  item: MonthlyGoalRow | null;
  noun: string;
  amountLabel: string;
  createAction: GoalAction;
  updateAction: GoalAction;
  onClose: () => void;
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
    }
  }, [pending, state, onClose]);

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
            className="mt-1 w-full rounded border border-slate-300 p-2"
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
            defaultValue={item ? centavosToPesosString(Math.abs(item.amount)) : undefined}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="startDate">
            Start date
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </div>
        <RecurrencePicker startDate={startDate} initialValue={initialRecurrenceValue} />
        <div>
          <label className="block text-sm text-slate-600" htmlFor="comments">
            Comments
          </label>
          <textarea
            id="comments"
            name="comments"
            defaultValue={item?.comments ?? ""}
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
