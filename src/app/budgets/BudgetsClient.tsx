"use client";

import { useState } from "react";
import Link from "next/link";
import { BudgetCard, type BudgetEntryRow } from "./BudgetCard";
import { BudgetModal, type BudgetRow } from "./BudgetModal";

export function BudgetsClient({
  budgets,
  entriesByBudgetId,
}: {
  budgets: BudgetRow[];
  entriesByBudgetId: Record<string, BudgetEntryRow[]>;
}) {
  const [modalState, setModalState] = useState<null | "new" | BudgetRow>(null);

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm text-slate-500 underline">
          &larr; Home
        </Link>

        <div className="mb-6 mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Budgets</h1>
            <p className="text-slate-600">Monthly allocations for variable spending.</p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-slate-900 px-4 py-2 text-white"
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
                onEdit={() => setModalState(budget)}
              />
            ))}
          </div>
        )}

        {modalState !== null && (
          <BudgetModal
            budget={modalState === "new" ? null : modalState}
            onClose={() => setModalState(null)}
          />
        )}
      </div>
    </main>
  );
}
