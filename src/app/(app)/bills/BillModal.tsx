"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { FormTip } from "@/components/FormTip";
import { DatePicker } from "@/components/DatePicker";
import { blockNegativeKey, centavosToPesosString } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { RecurrencePicker, type RecurrenceValue } from "@/components/recurring/RecurrencePicker";
import type { RecurrenceEndsType, RecurrenceUnit } from "@/lib/engine/types";
import { createBill, updateBill, type BillActionState } from "./actions";

export type BillRow = {
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
  // T175: false = temporarily switched off.
  active?: boolean;
};

// T71: options for the optional "connected account" dropdown.
export type BalanceOption = { id: string; name: string };

const initialState: BillActionState = { error: null };

export function BillModal({
  bill,
  balances,
  onClose,
  // T115: fired only on a genuine successful save, distinct from onClose
  // (which also fires on Cancel/X). NOTE: proved unreliable for the wizard
  // - see BalanceModal.tsx's matching comment for why (a revalidatePath
  // race can remount this component before its own effect observes
  // success). The wizard uses `createActionOverride` instead.
  onSaved,
  createActionOverride,
}: {
  bill: BillRow | null;
  balances: BalanceOption[];
  onClose: () => void;
  onSaved?: () => void;
  createActionOverride?: typeof createBill;
}) {
  const isEdit = bill !== null;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateBill : (createActionOverride ?? createBill),
    initialState,
  );
  const [startDate, setStartDate] = useState(bill?.start_date ?? todayInManila());
  const submitted = useRef(false);

  const initialRecurrenceValue: RecurrenceValue | null = bill
    ? {
        interval: bill.interval,
        unit: bill.unit,
        weekdays: bill.weekdays,
        daysOfMonth: bill.days_of_month,
        ordinal: bill.ordinal,
        ordinalWeekday: bill.ordinal_weekday,
        endsType: bill.ends_type,
        endDate: bill.end_date,
        occurrenceCount: bill.occurrence_count,
      }
    : null;

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
      onSaved?.();
    }
  }, [pending, state, onClose, onSaved]);

  return (
    <Modal title={isEdit ? "Edit bill" : "Add bill"} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        {isEdit && <input type="hidden" name="id" value={bill.id} />}
        {/* T120: every add/edit form now explains what the entry does to the
            forecast, not just what to type - a first-time user has no way to
            know that (say) connecting an account is what automates their
            balance updates. */}
        {!isEdit && (
          <FormTip tipKey="bill-intro" variant="panel">
            A bill is money going out on a repeating schedule - rent, utilities, subscriptions.
            Orium projects every future due date so you can see them coming.
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
            defaultValue={bill?.name}
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
            defaultValue={bill ? centavosToPesosString(Math.abs(bill.amount)) : undefined}
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
            // T107: only a brand-new bill can't start in the past - editing
            // an existing one (whose start date is normally already in the
            // past) stays unrestricted, matching the server-side check.
            min={isEdit ? undefined : todayInManila()}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
          />
        </div>
        <RecurrencePicker startDate={startDate} initialValue={initialRecurrenceValue} />
        <div>
          <label className="block text-sm text-slate-600" htmlFor="balanceId">
            Deducted from (optional)
          </label>
          <select
            id="balanceId"
            name="balanceId"
            defaultValue={bill?.balance_id ?? ""}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          >
            <option value="">No connected account</option>
            {balances.map((balance) => (
              <option key={balance.id} value={balance.id}>
                {balance.name}
              </option>
            ))}
          </select>
          <FormTip tipKey="bill-account">
            Connect an account and settling this bill automatically subtracts it from that
            account&rsquo;s balance - you never have to update the balance by hand. Left blank, it
            still counts against your forecast, just not against one specific account.
          </FormTip>
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="comments">
            Comments
          </label>
          <textarea
            id="comments"
            name="comments"
            defaultValue={bill?.comments ?? ""}
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
