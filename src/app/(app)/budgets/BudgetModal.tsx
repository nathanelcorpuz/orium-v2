"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { SegmentedControl } from "@/components/SegmentedControl";
import { centavosToPesosString } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { RecurrencePicker, type RecurrenceValue } from "@/components/recurring/RecurrencePicker";
import { type BudgetRow } from "@/lib/budgetView";
import { createBudget, updateBudget, type BudgetActionState } from "./actions";

export type { BudgetRow } from "@/lib/budgetView";

type ReplenishSource = "income" | "schedule";

const REPLENISH_OPTIONS: { value: ReplenishSource; label: string }[] = [
  { value: "income", label: "With an income" },
  { value: "schedule", label: "On a schedule" },
];

const initialState: BudgetActionState = { error: null };

export function BudgetModal({
  budget,
  incomes,
  onClose,
}: {
  budget: BudgetRow | null;
  incomes: { id: string; name: string }[];
  onClose: () => void;
}) {
  const isEdit = budget !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateBudget : createBudget,
    initialState,
  );
  const submitted = useRef(false);

  const [source, setSource] = useState<ReplenishSource>(() => {
    if (budget) {
      if (budget.linked_income_id !== null) return "income";
      if (budget.unit !== null) return "schedule";
    }
    return incomes.length > 0 ? "income" : "schedule";
  });
  const [startDate, setStartDate] = useState(budget?.start_date ?? todayInManila());

  const initialRecurrenceValue: RecurrenceValue | null =
    budget && budget.unit !== null && budget.interval !== null && budget.ends_type !== null
      ? {
          interval: budget.interval,
          unit: budget.unit,
          weekdays: budget.weekdays,
          daysOfMonth: budget.days_of_month,
          ordinal: budget.ordinal,
          ordinalWeekday: budget.ordinal_weekday,
          endsType: budget.ends_type,
          endDate: budget.end_date,
          occurrenceCount: budget.occurrence_count,
        }
      : null;

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
          <label className="block text-sm text-slate-600" htmlFor="allocationPesos">
            Allocation (₱)
          </label>
          <input
            id="allocationPesos"
            name="allocationPesos"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={budget ? centavosToPesosString(budget.allocation) : undefined}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </div>

        <div>
          <p className="mb-1 block text-sm text-slate-600">Replenishes</p>
          <SegmentedControl options={REPLENISH_OPTIONS} value={source} onChange={setSource} />
          <input type="hidden" name="replenishSource" value={source} />
        </div>

        {source === "income" &&
          (incomes.length > 0 ? (
            <div>
              <label className="block text-sm text-slate-600" htmlFor="linkedIncomeId">
                Income
              </label>
              <select
                id="linkedIncomeId"
                name="linkedIncomeId"
                required
                defaultValue={budget?.linked_income_id ?? ""}
                className="mt-1 w-full rounded border border-slate-300 p-2"
              >
                <option value="" disabled>
                  Choose an income source…
                </option>
                {incomes.map((income) => (
                  <option key={income.id} value={income.id}>
                    {income.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-slate-400">Resets each time this income lands.</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No income sources yet — add one on the Income page, or choose &ldquo;On a schedule&rdquo;
              instead.
            </p>
          ))}

        {source === "schedule" && (
          <div className="space-y-3">
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
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            id="carryoverEnabled"
            name="carryoverEnabled"
            type="checkbox"
            defaultChecked={budget ? budget.carryover_enabled : true}
            className="h-4 w-4 rounded border-slate-300"
          />
          <label className="text-sm text-slate-600" htmlFor="carryoverEnabled">
            Carry over unused balance to the next cycle
          </label>
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
