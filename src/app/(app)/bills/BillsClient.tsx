"use client";

import { useMemo, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { summarizeRecurrence } from "@/lib/recurrenceSummary";
import { AmountRangeFilter, matchesAmountFilter, type ComparisonOp } from "@/components/AmountRangeFilter";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import type { RecurrenceUnit } from "@/lib/engine/types";
import { deleteBill } from "./actions";
import { BillModal, type BillRow } from "./BillModal";

const UNIT_OPTIONS: { value: RecurrenceUnit; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

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

export function BillsClient({ bills, editedIds }: { bills: BillRow[]; editedIds: Set<string> }) {
  const [modalState, setModalState] = useState<null | "new" | BillRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // T52: Bills filter bar (name, amount range, recurrence unit) - client-side
  // only, same pattern as T50's Forecast filters, reusing the same shared
  // AmountRangeFilter/MultiSelectChips components.
  const [nameFilter, setNameFilter] = useState("");
  const [selectedUnits, setSelectedUnits] = useState<Set<RecurrenceUnit>>(new Set());
  const [amountOp, setAmountOp] = useState<ComparisonOp>("any");
  const [amountValue1, setAmountValue1] = useState("");
  const [amountValue2, setAmountValue2] = useState("");

  function toggleUnit(unit: RecurrenceUnit) {
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unit)) next.delete(unit);
      else next.add(unit);
      return next;
    });
  }

  function clearFilters() {
    setNameFilter("");
    setSelectedUnits(new Set());
    setAmountOp("any");
    setAmountValue1("");
    setAmountValue2("");
  }

  const filtersActive =
    nameFilter !== "" || selectedUnits.size > 0 || amountOp !== "any";

  const filteredBills = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    return bills.filter((bill) => {
      if (name && !bill.name.toLowerCase().includes(name)) return false;
      if (selectedUnits.size > 0 && !selectedUnits.has(bill.unit)) return false;
      if (!matchesAmountFilter(bill.amount, amountOp, amountValue1, amountValue2)) return false;
      return true;
    });
  }, [bills, nameFilter, selectedUnits, amountOp, amountValue1, amountValue2]);

  // Bills could previously only be monthly, so summing raw amounts was
  // exact; now that any recurrence unit is possible, the total needs the
  // same monthly-equivalent estimate the Dashboard/Income pages use. Goes
  // through billRule (not the raw row) because BillRow's days_of_month is
  // snake_case - monthlyEquivalent's optional daysOfMonth field would
  // silently miss it otherwise (no compile error, just a wrong total).
  // Always over the full unfiltered list - filters narrow what's displayed,
  // not what counts toward the page's own total.
  const totalMonthly = bills.reduce(
    (sum, bill) => sum + Math.abs(monthlyEquivalent({ ...billRule(bill), amount: bill.amount })),
    0,
  );

  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">Bills</h1>
            <p className="text-slate-500">Total monthly: {formatCentavos(totalMonthly)}</p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
          >
            Add bill
          </button>
        </div>

        {bills.length > 0 && (
          <div className="mb-4 rounded-lg border border-notion-hairline bg-white p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Name</label>
                <input
                  type="text"
                  value={nameFilter}
                  onChange={(event) => setNameFilter(event.target.value)}
                  placeholder="Search name"
                  className="w-32 rounded border border-notion-hairline px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Recurs</label>
                <MultiSelectChips options={UNIT_OPTIONS} selected={selectedUnits} onToggle={toggleUnit} />
              </div>
              <AmountRangeFilter
                label="Amount"
                op={amountOp}
                value1={amountValue1}
                value2={amountValue2}
                onOpChange={setAmountOp}
                onValue1Change={setAmountValue1}
                onValue2Change={setAmountValue2}
              />
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded border border-notion-hairline px-2 py-1 text-xs text-slate-500 hover:bg-notion-hover"
                >
                  Clear filters
                </button>
              )}
            </div>
            {filtersActive && (
              <p className="mt-2 text-xs text-slate-400">
                Showing {filteredBills.length} of {bills.length} bills
              </p>
            )}
          </div>
        )}

        {bills.length === 0 ? (
          <p className="text-slate-500">No bills yet. Add your first bill above.</p>
        ) : filteredBills.length === 0 ? (
          <p className="text-slate-500">No bills match these filters.</p>
        ) : (
          <ul className="space-y-2">
            {filteredBills.map((bill) => (
              <li
                key={bill.id}
                className="flex items-center justify-between rounded-lg border border-notion-hairline bg-white p-4"
              >
                <div>
                  <p className="font-medium text-notion-text">
                    {bill.name}
                    {editedIds.has(bill.id) && (
                      <span className="ml-1.5 text-slate-400" title="Edited from its usual schedule">
                        ✎
                      </span>
                    )}
                  </p>
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
                        className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setModalState(bill)}
                        className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
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
