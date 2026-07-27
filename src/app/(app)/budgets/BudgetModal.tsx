"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { FormTip } from "@/components/FormTip";
import { DatePicker } from "@/components/DatePicker";
import { SegmentedControl } from "@/components/SegmentedControl";
import { blockNegativeKey, centavosToPesosString } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { RecurrencePicker, type RecurrenceValue } from "@/components/recurring/RecurrencePicker";
import { type BudgetRow } from "@/lib/budgetView";
import { createBudget, updateBudget, type BudgetActionState } from "./actions";

export type { BudgetRow } from "@/lib/budgetView";

// Phase 10/T55 gave a budget two replenish modes (income-linked or manual);
// Phase 11/T60 adds a third back - "schedule" ("Replenish every", the
// budget's own recurrence rule, same shared RecurrencePicker Bills/Income/
// Debt/Savings use) - for a budget that isn't tied to any income.
type ReplenishSource = "income" | "schedule" | "manual";

const REPLENISH_OPTIONS: { value: ReplenishSource; label: string }[] = [
  { value: "income", label: "Connected to an income" },
  { value: "schedule", label: "Replenish every" },
  { value: "manual", label: "Manual" },
];

const initialState: BudgetActionState = { error: null };

export function BudgetModal({
  budget,
  incomes,
  onClose,
  // T115: fired only on a genuine successful save, distinct from onClose
  // (which also fires on Cancel/X). NOTE: proved unreliable for the wizard
  // - see BalanceModal.tsx's matching comment for why. The wizard uses
  // `createActionOverride` instead.
  onSaved,
  createActionOverride,
}: {
  budget: BudgetRow | null;
  incomes: { id: string; name: string }[];
  onClose: () => void;
  onSaved?: () => void;
  createActionOverride?: typeof createBudget;
}) {
  const isEdit = budget !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateBudget : (createActionOverride ?? createBudget),
    initialState,
  );
  const submitted = useRef(false);

  const [source, setSource] = useState<ReplenishSource>(
    budget?.linked_income_id ? "income" : budget?.start_date ? "schedule" : "manual",
  );
  const [startDate, setStartDate] = useState(budget?.start_date ?? todayInManila());

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
      onSaved?.();
    }
  }, [pending, state, onClose, onSaved]);

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
        <input type="hidden" name="replenishSource" value={source} />
        {!isEdit && (
          <FormTip tipKey="budget-intro" variant="panel">
            A budget is a running pot for spending that varies - groceries, fuel, eating out. It
            isn&rsquo;t a fixed bill: you top it up, log spends against it, and Orium sets the
            whole pot aside in your forecast so the balance you see is what&rsquo;s genuinely
            spare.
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
            defaultValue={budget?.name}
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
          <p className="mt-1 text-sm text-slate-400">
            How much gets added when this budget replenishes.
          </p>
        </div>

        <div>
          <p className="mb-1 block text-sm text-slate-600">Replenishes</p>
          <SegmentedControl options={REPLENISH_OPTIONS} value={source} onChange={setSource} />
          <FormTip tipKey="budget-replenish">
            How this pot gets topped up: automatically when an income arrives, automatically on
            its own schedule, or only when you add funds yourself.
          </FormTip>
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
              <p className="mt-1 text-sm text-slate-400">Replenishes each time this income is settled.</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No income sources yet - add one on the Income page, or choose &ldquo;Manual&rdquo; instead.
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
            <FormTip tipKey="budget-schedule">
              The replenish amount is added back to this pot every time the schedule comes round.
            </FormTip>
          </div>
        )}

        {source === "manual" && (
          <p className="text-sm text-slate-400">
            You&rsquo;ll add or take funds yourself from the Budgets page.
          </p>
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
