"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { DatePicker } from "@/components/DatePicker";
import { SegmentedControl } from "@/components/SegmentedControl";
import { blockNegativeKey, centavosToPesosString } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { RecurrencePicker, type RecurrenceValue } from "@/components/recurring/RecurrencePicker";
import { summarizeRecurrence } from "@/lib/recurrenceSummary";
import { createScenarioBudget, updateScenarioBudget, type ScenarioActionState } from "./actions";

// T218 follow-up (REMINDER, 2026-08-02): full parity with a real budget's
// own row shape (`BudgetRow`, BudgetModal.tsx) - see actions.ts's own
// comment on `readScenarioBudgetForm` for what's deliberately excluded
// (budget-account linking).
export type ScenarioBudgetRow = {
  id: string;
  name: string;
  allocation: number;
  linked_scenario_income_id: string | null;
  start_date: string | null;
  interval: number | null;
  unit: "day" | "week" | "month" | "year" | null;
  weekdays: number[] | null;
  days_of_month: number[] | null;
  ordinal: number | null;
  ordinal_weekday: number | null;
  ends_type: "never" | "on_date" | "after_count" | null;
  end_date: string | null;
  occurrence_count: number | null;
};

// Just the scenario's own income items - a scenario budget can only link to
// a hypothetical income that lives in the same scenario, never a real one
// (see migration 0046's own comment on why).
export type ScenarioIncomeOption = {
  id: string;
  name: string;
  startDate: string;
  interval: number;
  unit: "day" | "week" | "month" | "year";
  weekdays: number[] | null;
  daysOfMonth: number[] | null;
  ordinal: number | null;
  ordinalWeekday: number | null;
  endsType: "never" | "on_date" | "after_count";
  endDate: string | null;
  occurrenceCount: number | null;
};

type ReplenishSource = "income" | "schedule" | "manual";

const REPLENISH_OPTIONS: { value: ReplenishSource; label: string }[] = [
  { value: "income", label: "Connected to an income" },
  { value: "schedule", label: "Replenish every" },
  { value: "manual", label: "Manual" },
];

const initialState: ScenarioActionState = { error: null };

export function ScenarioBudgetModal({
  scenarioId,
  budget,
  incomes,
  onClose,
}: {
  scenarioId: string;
  budget: ScenarioBudgetRow | null;
  incomes: ScenarioIncomeOption[];
  onClose: () => void;
}) {
  const isEdit = budget !== null;
  const [state, formAction, pending] = useActionState(isEdit ? updateScenarioBudget : createScenarioBudget, initialState);
  const submitted = useRef(false);

  const [source, setSource] = useState<ReplenishSource>(
    budget?.linked_scenario_income_id ? "income" : budget?.start_date ? "schedule" : "manual",
  );
  const [startDate, setStartDate] = useState(budget?.start_date ?? todayInManila());
  const [selectedIncomeId, setSelectedIncomeId] = useState(budget?.linked_scenario_income_id ?? "");
  const selectedIncome = incomes.find((income) => income.id === selectedIncomeId) ?? null;

  const initialRecurrenceValue: RecurrenceValue | null =
    budget && budget.start_date && budget.interval !== null && budget.unit !== null && budget.ends_type !== null
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
    <Modal title={isEdit ? "Edit scenario budget" : "Add scenario budget"} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        <input type="hidden" name="scenarioId" value={scenarioId} />
        {isEdit && <input type="hidden" name="id" value={budget.id} />}
        <input type="hidden" name="replenishSource" value={source} />
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
            placeholder="e.g. Travel fund"
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="allocationPesos">
            Replenish amount (₱)
          </label>
          <input
            id="allocationPesos"
            name="allocationPesos"
            type="number"
            step="0.01"
            min="0"
            required
            onKeyDown={blockNegativeKey}
            defaultValue={budget ? centavosToPesosString(budget.allocation) : undefined}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
          <p className="mt-1 text-sm text-slate-400">How much this hypothetical pot gets topped up by.</p>
        </div>

        <div>
          <p className="mb-1 block text-sm text-slate-600">Replenishes</p>
          <SegmentedControl options={REPLENISH_OPTIONS} value={source} onChange={setSource} />
          <p className="mt-1 text-sm text-slate-400">
            Same as a real budget - but as a hypothetical, the forecast effect still only comes
            from entries you actually log below, not from this schedule alone.
          </p>
        </div>

        {source === "income" &&
          (incomes.length > 0 ? (
            <div>
              <label className="block text-sm text-slate-600" htmlFor="linkedScenarioIncomeId">
                Income
              </label>
              <select
                id="linkedScenarioIncomeId"
                name="linkedScenarioIncomeId"
                required
                value={selectedIncomeId}
                onChange={(event) => setSelectedIncomeId(event.target.value)}
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
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
              <p className="mt-1 text-sm text-slate-400">
                {selectedIncome && `${summarizeRecurrence(selectedIncome)}.`}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No income items in this scenario yet - add one first, or choose &ldquo;Manual&rdquo; instead.
            </p>
          ))}

        {source === "schedule" && (
          <div className="space-y-4">
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
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
              />
            </div>
            <RecurrencePicker startDate={startDate} initialValue={initialRecurrenceValue} />
          </div>
        )}

        {source === "manual" && (
          <p className="text-sm text-slate-400">You&rsquo;ll log entries yourself, same as a real manual budget.</p>
        )}

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
