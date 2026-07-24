"use client";

import { useMemo, useState } from "react";
import { AmountRangeFilter, matchesAmountFilter, type ComparisonOp } from "@/components/AmountRangeFilter";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import { BudgetCard, type BudgetEntryRow, type IncomeItemRow } from "./BudgetCard";
import { BudgetModal, type BudgetRow } from "./BudgetModal";

type ReplenishType = "manual" | "income" | "schedule";

const REPLENISH_TYPE_OPTIONS: { value: ReplenishType; label: string }[] = [
  { value: "income", label: "Connected to income" },
  { value: "schedule", label: "Own schedule" },
  { value: "manual", label: "Manual" },
];

function replenishType(budget: BudgetRow): ReplenishType {
  if (budget.linked_income_id !== null) return "income";
  if (budget.unit !== null) return "schedule";
  return "manual";
}

export function BudgetsClient({
  budgets,
  entriesByBudgetId,
  incomes,
  editedIds,
}: {
  budgets: BudgetRow[];
  entriesByBudgetId: Record<string, BudgetEntryRow[]>;
  incomes: IncomeItemRow[];
  editedIds: Set<string>;
}) {
  const [modalState, setModalState] = useState<null | "new" | BudgetRow>(null);

  // T52: Budgets filter bar - name, allocation range, and replenish type
  // (Manual / Connected to income / Own schedule) in place of the
  // recurrence-unit filter the four recurring-item pages use, since a
  // budget's own schedule is only one of three replenish modes.
  const [nameFilter, setNameFilter] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<ReplenishType>>(new Set());
  const [allocationOp, setAllocationOp] = useState<ComparisonOp>("any");
  const [allocationValue1, setAllocationValue1] = useState("");
  const [allocationValue2, setAllocationValue2] = useState("");

  function toggleType(type: ReplenishType) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function clearFilters() {
    setNameFilter("");
    setSelectedTypes(new Set());
    setAllocationOp("any");
    setAllocationValue1("");
    setAllocationValue2("");
  }

  const filtersActive =
    nameFilter !== "" || selectedTypes.size > 0 || allocationOp !== "any";

  const filteredBudgets = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    return budgets.filter((budget) => {
      if (name && !budget.name.toLowerCase().includes(name)) return false;
      if (selectedTypes.size > 0 && !selectedTypes.has(replenishType(budget))) return false;
      if (!matchesAmountFilter(budget.allocation, allocationOp, allocationValue1, allocationValue2)) {
        return false;
      }
      return true;
    });
  }, [budgets, nameFilter, selectedTypes, allocationOp, allocationValue1, allocationValue2]);

  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">Budgets</h1>
            <p className="text-slate-500">A running total for variable spending.</p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
          >
            Add budget
          </button>
        </div>

        {budgets.length > 0 && (
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
                <label className="text-xs text-slate-500">Replenishes</label>
                <MultiSelectChips
                  options={REPLENISH_TYPE_OPTIONS}
                  selected={selectedTypes}
                  onToggle={toggleType}
                />
              </div>
              <AmountRangeFilter
                label="Allocation"
                op={allocationOp}
                value1={allocationValue1}
                value2={allocationValue2}
                onOpChange={setAllocationOp}
                onValue1Change={setAllocationValue1}
                onValue2Change={setAllocationValue2}
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
                Showing {filteredBudgets.length} of {budgets.length} budgets
              </p>
            )}
          </div>
        )}

        {budgets.length === 0 ? (
          <p className="text-slate-500">No budgets yet. Add your first one above.</p>
        ) : filteredBudgets.length === 0 ? (
          <p className="text-slate-500">No budgets match these filters.</p>
        ) : (
          <div className="space-y-4">
            {filteredBudgets.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                entries={entriesByBudgetId[budget.id] ?? []}
                incomes={incomes}
                onEdit={() => setModalState(budget)}
                edited={editedIds.has(budget.id)}
              />
            ))}
          </div>
        )}

        {modalState !== null && (
          <BudgetModal
            budget={modalState === "new" ? null : modalState}
            incomes={incomes}
            onClose={() => setModalState(null)}
          />
        )}
      </div>
    </div>
  );
}
