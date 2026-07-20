"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { centavosToPesosString } from "@/lib/money";
import { createIncome, updateIncome, type IncomeActionState } from "./actions";
import type { RecurringFrequency } from "@/lib/engine/types";

export type IncomeRow = {
  id: string;
  name: string;
  amount: number;
  frequency: RecurringFrequency;
  day_of_month: number | null;
  start_date: string;
  end_date: string;
  comments: string | null;
};

const initialState: IncomeActionState = { error: null };

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  biweekly: "Biweekly",
  semi_monthly_15_30: "Twice a month (15th & 30th)",
};

export function IncomeModal({ income, onClose }: { income: IncomeRow | null; onClose: () => void }) {
  const isEdit = income !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateIncome : createIncome,
    initialState,
  );
  const [frequency, setFrequency] = useState<RecurringFrequency>(income?.frequency ?? "monthly");
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
    }
  }, [pending, state, onClose]);

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
            className="mt-1 w-full rounded border border-slate-300 p-2"
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
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="frequency">
            Frequency
          </label>
          <select
            id="frequency"
            name="frequency"
            required
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          >
            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {frequency === "monthly" && (
          <div>
            <label className="block text-sm text-slate-600" htmlFor="dayOfMonth">
              Day of month
            </label>
            <input
              id="dayOfMonth"
              name="dayOfMonth"
              type="number"
              min="1"
              max="31"
              required
              defaultValue={income?.day_of_month ?? undefined}
              className="mt-1 w-full rounded border border-slate-300 p-2"
            />
          </div>
        )}

        {(frequency === "weekly" || frequency === "biweekly") && (
          <div>
            <label className="block text-sm text-slate-600" htmlFor="startDate">
              First payday ({frequency === "weekly" ? "weekly" : "every 2 weeks"} from this date)
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              required
              defaultValue={income?.start_date}
              className="mt-1 w-full rounded border border-slate-300 p-2"
            />
          </div>
        )}

        <div>
          <label className="block text-sm text-slate-600" htmlFor="endDate">
            Track until
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            required
            defaultValue={income?.end_date}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="comments">
            Comments
          </label>
          <textarea
            id="comments"
            name="comments"
            defaultValue={income?.comments ?? ""}
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
