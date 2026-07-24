"use client";

import { useMemo, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { remainingTotal } from "@/lib/engine/remaining";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { summarizeRecurrence } from "@/lib/recurrenceSummary";
import { todayInManila } from "@/lib/date";
import { AmountRangeFilter, matchesAmountFilter, type ComparisonOp } from "@/components/AmountRangeFilter";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import type { RecurrenceUnit } from "@/lib/engine/types";
import type { RecurringItemActionState } from "@/lib/recurringItem";
import { MonthlyGoalModal } from "./MonthlyGoalModal";
import type { MonthlyGoalRow } from "./MonthlyGoalRow";

type GoalAction = (
  prevState: RecurringItemActionState,
  formData: FormData,
) => Promise<RecurringItemActionState>;
type DeleteAction = (formData: FormData) => Promise<void>;

const UNIT_OPTIONS: { value: RecurrenceUnit; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

function goalRule(item: MonthlyGoalRow) {
  return {
    startDate: item.start_date,
    interval: item.interval,
    unit: item.unit,
    weekdays: item.weekdays,
    daysOfMonth: item.days_of_month,
    ordinal: item.ordinal,
    ordinalWeekday: item.ordinal_weekday,
    endsType: item.ends_type,
    endDate: item.end_date,
    occurrenceCount: item.occurrence_count,
  };
}

export function MonthlyGoalsClient({
  items,
  pageTitle,
  noun,
  amountLabel,
  amountColorClass,
  createAction,
  updateAction,
  deleteAction,
  editedIds,
}: {
  items: MonthlyGoalRow[];
  pageTitle: string;
  noun: string;
  amountLabel: string;
  amountColorClass: string;
  createAction: GoalAction;
  updateAction: GoalAction;
  deleteAction: DeleteAction;
  editedIds: Set<string>;
}) {
  const [modalState, setModalState] = useState<null | "new" | MonthlyGoalRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // T52: filter bar (name, amount range, recurrence unit) shared by both
  // Debt and Savings since they both render through this one component.
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

  const filteredItems = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    return items.filter((item) => {
      if (name && !item.name.toLowerCase().includes(name)) return false;
      if (selectedUnits.size > 0 && !selectedUnits.has(item.unit)) return false;
      if (!matchesAmountFilter(item.amount, amountOp, amountValue1, amountValue2)) return false;
      return true;
    });
  }, [items, nameFilter, selectedUnits, amountOp, amountValue1, amountValue2]);

  const today = todayInManila();
  // Debt/Savings could previously only be monthly, so summing raw amounts
  // was exact; now that any recurrence unit is possible, the total needs
  // the same monthly-equivalent estimate the Dashboard/Income pages use.
  // Goes through goalRule (not the raw row) since MonthlyGoalRow's
  // days_of_month is snake_case, matching Supabase - both functions expect
  // camelCase daysOfMonth. Always over the full unfiltered list - filters
  // narrow what's displayed, not what counts toward the page's own totals.
  const totalMonthly = items.reduce(
    (sum, item) => sum + Math.abs(monthlyEquivalent({ ...goalRule(item), amount: item.amount })),
    0,
  );
  // "never"-ending items have no finite total (SPEC.md); they're excluded
  // here and shown as "Ongoing" per-item below instead.
  const totalRemaining = items.reduce(
    (sum, item) => sum + (remainingTotal({ ...goalRule(item), amount: item.amount }, today) ?? 0),
    0,
  );

  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">{pageTitle}</h1>
            <p className="text-slate-500">
              Total monthly: <span className={amountColorClass}>{formatCentavos(totalMonthly)}</span>
            </p>
            <p className="text-slate-500">
              Total remaining:{" "}
              <span className={amountColorClass}>{formatCentavos(totalRemaining)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
          >
            Add {noun}
          </button>
        </div>

        {items.length > 0 && (
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
                Showing {filteredItems.length} of {items.length} {noun}s
              </p>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-slate-500">No {noun}s yet. Add your first one above.</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-slate-500">No {noun}s match these filters.</p>
        ) : (
          <ul className="space-y-2">
            {filteredItems.map((item) => {
              const remaining = remainingTotal({ ...goalRule(item), amount: item.amount }, today);
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-notion-hairline bg-white p-4"
                >
                  <div>
                    <p className="font-medium text-notion-text">
                      {item.name}
                      {editedIds.has(item.id) && (
                        <span className="ml-1.5 text-slate-400" title="Edited from its usual schedule">
                          ✎
                        </span>
                      )}
                    </p>
                    <p className={`text-sm ${amountColorClass}`}>{formatCentavos(Math.abs(item.amount))}</p>
                    <p className="text-sm text-slate-400">{summarizeRecurrence(goalRule(item))}</p>
                    <p className="text-sm text-slate-400">
                      {remaining === null ? "Ongoing" : `${formatCentavos(remaining)} remaining`}
                    </p>
                    {item.comments && <p className="text-sm text-slate-400">{item.comments}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {confirmingDeleteId === item.id ? (
                      <>
                        <span className="text-sm text-slate-600">Delete?</span>
                        <form action={deleteAction}>
                          <input type="hidden" name="id" value={item.id} />
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
                          onClick={() => setModalState(item)}
                          className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(item.id)}
                          className="rounded border border-red-300 px-3 py-1 text-sm text-red-600"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {modalState !== null && (
          <MonthlyGoalModal
            item={modalState === "new" ? null : modalState}
            noun={noun}
            amountLabel={amountLabel}
            createAction={createAction}
            updateAction={updateAction}
            onClose={() => setModalState(null)}
          />
        )}
      </div>
    </div>
  );
}
