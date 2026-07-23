"use client";

import { useState } from "react";
import { BudgetCard, type BudgetEntryRow, type IncomeItemRow } from "./BudgetCard";
import { BudgetModal, type BudgetRow } from "./BudgetModal";

export function BudgetsClient({
  budgets,
  entriesByBudgetId,
  incomes,
}: {
  budgets: BudgetRow[];
  entriesByBudgetId: Record<string, BudgetEntryRow[]>;
  incomes: IncomeItemRow[];
}) {
  const [modalState, setModalState] = useState<null | "new" | BudgetRow>(null);

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

        {budgets.length === 0 ? (
          <p className="text-slate-500">No budgets yet. Add your first one above.</p>
        ) : (
          <div className="space-y-4">
            {budgets.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                entries={entriesByBudgetId[budget.id] ?? []}
                incomes={incomes}
                onEdit={() => setModalState(budget)}
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
