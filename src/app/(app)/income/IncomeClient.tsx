"use client";

import { useMemo, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { summarizeRecurrence } from "@/lib/recurrenceSummary";
import { AmountRangeFilter, matchesAmountFilter, type ComparisonOp } from "@/components/AmountRangeFilter";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import type { RecurrenceUnit } from "@/lib/engine/types";
import { deleteIncome } from "./actions";
import { IncomeModal, type IncomeRow } from "./IncomeModal";

const UNIT_OPTIONS: { value: RecurrenceUnit; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

function incomeRule(income: IncomeRow) {
  return {
    startDate: income.start_date,
    interval: income.interval,
    unit: income.unit,
    weekdays: income.weekdays,
    daysOfMonth: income.days_of_month,
    ordinal: income.ordinal,
    ordinalWeekday: income.ordinal_weekday,
    endsType: income.ends_type,
    endDate: income.end_date,
    occurrenceCount: income.occurrence_count,
  };
}

export function IncomeClient({ incomes, editedIds }: { incomes: IncomeRow[]; editedIds: Set<string> }) {
  const [modalState, setModalState] = useState<null | "new" | IncomeRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // T52: Income filter bar (name, amount range, recurrence unit) - mirrors
  // Bills' filter bar exactly, reusing the same shared components.
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

  const filteredIncomes = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    return incomes.filter((income) => {
      if (name && !income.name.toLowerCase().includes(name)) return false;
      if (selectedUnits.size > 0 && !selectedUnits.has(income.unit)) return false;
      if (!matchesAmountFilter(income.amount, amountOp, amountValue1, amountValue2)) return false;
      return true;
    });
  }, [incomes, nameFilter, selectedUnits, amountOp, amountValue1, amountValue2]);

  // Goes through incomeRule (not the raw row) because IncomeRow's
  // days_of_month is snake_case - monthlyEquivalent's optional daysOfMonth
  // field would silently miss it otherwise (no compile error, just a
  // wrong total, since the mismatch is on an optional property). Always over
  // the full unfiltered list - filters narrow what's displayed, not what
  // counts toward the page's own total.
  const totalMonthly = incomes.reduce(
    (sum, income) => sum + monthlyEquivalent({ ...incomeRule(income), amount: income.amount }),
    0,
  );

  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">Income</h1>
            <p className="text-slate-500">
              Total monthly (est.): <span className="text-green-700">{formatCentavos(totalMonthly)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
          >
            Add income
          </button>
        </div>

        {incomes.length > 0 && (
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
                Showing {filteredIncomes.length} of {incomes.length} income sources
              </p>
            )}
          </div>
        )}

        {incomes.length === 0 ? (
          <p className="text-slate-500">No income sources yet. Add your first one above.</p>
        ) : filteredIncomes.length === 0 ? (
          <p className="text-slate-500">No income sources match these filters.</p>
        ) : (
          <ul className="space-y-2">
            {filteredIncomes.map((income) => (
              <li
                key={income.id}
                className="flex items-center justify-between rounded-lg border border-notion-hairline bg-white p-4"
              >
                <div>
                  <p className="font-medium text-notion-text">
                    {income.name}
                    {editedIds.has(income.id) && (
                      <span className="ml-1.5 text-slate-400" title="Edited from its usual schedule">
                        ✎
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-green-700">{formatCentavos(income.amount)}</p>
                  <p className="text-sm text-slate-400">{summarizeRecurrence(incomeRule(income))}</p>
                  {income.comments && (
                    <p className="text-sm text-slate-400">{income.comments}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {confirmingDeleteId === income.id ? (
                    <>
                      <span className="text-sm text-slate-600">Delete?</span>
                      <form action={deleteIncome}>
                        <input type="hidden" name="id" value={income.id} />
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
                        onClick={() => setModalState(income)}
                        className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(income.id)}
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
          <IncomeModal
            income={modalState === "new" ? null : modalState}
            onClose={() => setModalState(null)}
          />
        )}
      </div>
    </div>
  );
}
