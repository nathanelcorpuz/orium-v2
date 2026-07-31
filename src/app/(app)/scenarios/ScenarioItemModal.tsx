"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { DatePicker } from "@/components/DatePicker";
import { blockNegativeKey, centavosToPesosString } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { RecurrencePicker, type RecurrenceValue } from "@/components/recurring/RecurrencePicker";
import type { RecurrenceEndsType, RecurrenceUnit } from "@/lib/engine/types";
import { createScenarioItem, updateScenarioItem, type ScenarioActionState } from "./actions";

// T174: mirrors BillModal.tsx's BillRow shape almost exactly - the whole
// point of reusing RecurrencePicker/readRecurrenceRuleForm is that a
// scenario item is the same kind of thing a real bill/income/debt/savings
// item is, just stored in a separate table. `type` is editable here (a real
// BillRow never needs it - its own page already fixes the type), since one
// unified modal covers all four recurring types for scenarios.
export type ScenarioItemRow = {
  id: string;
  name: string;
  type: "bill" | "income" | "debt" | "savings";
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

export type BalanceOption = { id: string; name: string };

const TYPE_OPTIONS: { value: ScenarioItemRow["type"]; label: string }[] = [
  { value: "bill", label: "Bill" },
  { value: "income", label: "Income" },
  { value: "debt", label: "Debt" },
  { value: "savings", label: "Savings" },
];

const initialState: ScenarioActionState = { error: null };

export function ScenarioItemModal({
  scenarioId,
  item,
  balances,
  onClose,
}: {
  scenarioId: string;
  item: ScenarioItemRow | null;
  balances: BalanceOption[];
  onClose: () => void;
}) {
  const isEdit = item !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateScenarioItem : createScenarioItem,
    initialState,
  );
  const [type, setType] = useState<ScenarioItemRow["type"]>(item?.type ?? "bill");
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
    if (submitted.current && !pending && !state.error) onClose();
  }, [pending, state, onClose]);

  return (
    <Modal title={isEdit ? "Edit scenario item" : "Add scenario item"} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        <input type="hidden" name="scenarioId" value={scenarioId} />
        {isEdit && <input type="hidden" name="id" value={item.id} />}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="type">
            Type
          </label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as ScenarioItemRow["type"])}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
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
            Amount (₱)
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
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="startDate">
            Start date
          </label>
          {/* T174: unlike every real create form, a scenario item's start
              date is allowed in the past - see readScenarioItemForm's own
              comment for why ("what if I'd started this 3 months ago" is a
              legitimate question). No `min` restriction here. */}
          <DatePicker
            id="startDate"
            name="startDate"
            required
            value={startDate}
            onChange={setStartDate}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
          />
        </div>
        <RecurrencePicker
          startDate={startDate}
          initialValue={initialRecurrenceValue}
          allowNever={type !== "debt" && type !== "savings"}
        />
        <div>
          <label className="block text-sm text-slate-600" htmlFor="balanceId">
            Connected account (optional)
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
