"use client";

import { useState } from "react";
import { formatCentavos } from "@/lib/money";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { summarizeRecurrence } from "@/lib/recurrenceSummary";
import { deleteBill } from "./actions";
import { BillModal, type BillRow } from "./BillModal";

function billRule(bill: BillRow) {
  return {
    startDate: bill.start_date,
    interval: bill.interval,
    unit: bill.unit,
    weekdays: bill.weekdays,
    daysOfMonth: bill.days_of_month,
    ordinal: bill.ordinal,
    ordinalWeekday: bill.ordinal_weekday,
    endsType: bill.ends_type,
    endDate: bill.end_date,
    occurrenceCount: bill.occurrence_count,
  };
}

export function BillsClient({ bills }: { bills: BillRow[] }) {
  const [modalState, setModalState] = useState<null | "new" | BillRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Bills could previously only be monthly, so summing raw amounts was
  // exact; now that any recurrence unit is possible, the total needs the
  // same monthly-equivalent estimate the Dashboard/Income pages use. Goes
  // through billRule (not the raw row) because BillRow's days_of_month is
  // snake_case - monthlyEquivalent's optional daysOfMonth field would
  // silently miss it otherwise (no compile error, just a wrong total).
  const totalMonthly = bills.reduce(
    (sum, bill) => sum + Math.abs(monthlyEquivalent({ ...billRule(bill), amount: bill.amount })),
    0,
  );

  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Bills</h1>
            <p className="text-slate-600">Total monthly: {formatCentavos(totalMonthly)}</p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-slate-900 px-4 py-2 text-white"
          >
            Add bill
          </button>
        </div>

        {bills.length === 0 ? (
          <p className="text-slate-500">No bills yet. Add your first bill above.</p>
        ) : (
          <ul className="space-y-2">
            {bills.map((bill) => (
              <li
                key={bill.id}
                className="flex items-center justify-between rounded-xl bg-white p-4 shadow"
              >
                <div>
                  <p className="font-medium">{bill.name}</p>
                  <p className="text-sm text-slate-600">{formatCentavos(Math.abs(bill.amount))}</p>
                  <p className="text-sm text-slate-400">{summarizeRecurrence(billRule(bill))}</p>
                  {bill.comments && <p className="text-sm text-slate-400">{bill.comments}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {confirmingDeleteId === bill.id ? (
                    <>
                      <span className="text-sm text-slate-600">Delete?</span>
                      <form action={deleteBill}>
                        <input type="hidden" name="id" value={bill.id} />
                        <button
                          type="submit"
                          className="rounded border border-red-300 px-3 py-1 text-sm text-red-600"
                        >
                          Yes
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(null)}
                        className="rounded border border-slate-300 px-3 py-1 text-sm"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setModalState(bill)}
                        className="rounded border border-slate-300 px-3 py-1 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(bill.id)}
                        className="rounded border border-red-300 px-3 py-1 text-sm text-red-600"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {modalState !== null && (
          <BillModal
            bill={modalState === "new" ? null : modalState}
            onClose={() => setModalState(null)}
          />
        )}
      </div>
    </div>
  );
}
