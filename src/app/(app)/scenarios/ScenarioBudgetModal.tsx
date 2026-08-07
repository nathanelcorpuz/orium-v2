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
import type { BalanceOption } from "./ScenarioItemModal";

// T218 follow-up (REMINDER, 2026-08-02): full parity with a real budget's
// own row shape (`BudgetRow`, BudgetModal.tsx). T223 (same day, "adding
// budgets in scenarios should inherit all actual data"): can now also link
// to a real income and/or a real account, not just this scenario's own
// hypothetical income items - see actions.ts's `readScenarioBudgetForm` and
// migration 0047's own comment. T284: `budget_account_id` renamed to
// `balance_id` - it always pointed at a real account (never scenario data),
// and that account is now just a regular `balances` row (migration 0054).
export type ScenarioBudgetRow = {
  id: string;
  name: string;
  allocation: number;
  linked_income_id: string | null;
  linked_scenario_income_id: string | null;
  balance_id: string | null;
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

// Shared shape for both a scenario's own income items and real ones - same
// fields either way, just sourced from a different table server-side.
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

// T223: one picker offering both real and scenario incomes, values
// prefixed to tell them apart - decoded server-side in
// readScenarioBudgetForm (actions.ts), same encoding pattern
// MoveBudgetFundsModal.tsx uses for its own two-kind picker.
const REAL_INCOME_PREFIX = "real:";
const SCENARIO_INCOME_PREFIX = "scenario:";

const initialState: ScenarioActionState = { error: null };

export function ScenarioBudgetModal({
  scenarioId,
  budget,
  incomes,
  realIncomes,
  balances,
  onClose,
}: {
  scenarioId: string;
  budget: ScenarioBudgetRow | null;
  // This scenario's own hypothetical income items.
  incomes: ScenarioIncomeOption[];
  // T223: every real income, offered as an option too.
  realIncomes: ScenarioIncomeOption[];
  // T223/T284: every real account, as an optional storage reference - never
  // mutated by scenario activity (see migration 0047's own comment). There's
  // no separate "budget accounts" list anymore.
  balances: BalanceOption[];
  onClose: () => void;
}) {
  const isEdit = budget !== null;
  const [state, formAction, pending] = useActionState(isEdit ? updateScenarioBudget : createScenarioBudget, initialState);
  const submitted = useRef(false);

  const [source, setSource] = useState<ReplenishSource>(
    budget?.linked_income_id || budget?.linked_scenario_income_id
      ? "income"
      : budget?.start_date
        ? "schedule"
        : "manual",
  );
  const [startDate, setStartDate] = useState(budget?.start_date ?? todayInManila());
  const [incomeSelection, setIncomeSelection] = useState(
    budget?.linked_income_id
      ? `${REAL_INCOME_PREFIX}${budget.linked_income_id}`
      : budget?.linked_scenario_income_id
        ? `${SCENARIO_INCOME_PREFIX}${budget.linked_scenario_income_id}`
        : "",
  );
  const selectedIncome = incomeSelection.startsWith(REAL_INCOME_PREFIX)
    ? realIncomes.find((income) => income.id === incomeSelection.slice(REAL_INCOME_PREFIX.length))
    : incomeSelection.startsWith(SCENARIO_INCOME_PREFIX)
      ? incomes.find((income) => income.id === incomeSelection.slice(SCENARIO_INCOME_PREFIX.length))
      : undefined;

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

        {/* T223/T284: purely a reference to where this budget's money would
            live - never touched by logging a scenario entry, only becomes
            a real connection if this scenario is later activated. */}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="balanceId">
            Account (optional)
          </label>
          <select
            id="balanceId"
            name="balanceId"
            defaultValue={budget?.balance_id ?? ""}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          >
            <option value="">No account</option>
            {balances.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
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
          (incomes.length > 0 || realIncomes.length > 0 ? (
            <div>
              <label className="block text-sm text-slate-600" htmlFor="incomeSelection">
                Income
              </label>
              <select
                id="incomeSelection"
                name="incomeSelection"
                required
                value={incomeSelection}
                onChange={(event) => setIncomeSelection(event.target.value)}
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
              >
                <option value="" disabled>
                  Choose an income source…
                </option>
                {realIncomes.length > 0 && (
                  <optgroup label="Real income">
                    {realIncomes.map((income) => (
                      <option key={income.id} value={`${REAL_INCOME_PREFIX}${income.id}`}>
                        {income.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {incomes.length > 0 && (
                  <optgroup label="This scenario's income">
                    {incomes.map((income) => (
                      <option key={income.id} value={`${SCENARIO_INCOME_PREFIX}${income.id}`}>
                        {income.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="mt-1 text-sm text-slate-400">
                {selectedIncome && `${summarizeRecurrence(selectedIncome)}.`}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No income sources available - add one first, or choose &ldquo;Manual&rdquo; instead.
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
