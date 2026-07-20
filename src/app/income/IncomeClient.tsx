"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCentavos, monthlyEquivalentCentavos } from "@/lib/money";
import { deleteIncome } from "./actions";
import { IncomeModal, type IncomeRow } from "./IncomeModal";

const FREQUENCY_TEXT: Record<IncomeRow["frequency"], (row: IncomeRow) => string> = {
  monthly: (row) => `due on day ${row.day_of_month}`,
  weekly: (row) => `weekly, starting ${row.start_date}`,
  biweekly: (row) => `every 2 weeks, starting ${row.start_date}`,
  semi_monthly_15_30: () => "on the 15th & last day of the month",
};

export function IncomeClient({ incomes }: { incomes: IncomeRow[] }) {
  const [modalState, setModalState] = useState<null | "new" | IncomeRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const totalMonthly = incomes.reduce(
    (sum, income) => sum + monthlyEquivalentCentavos(income.amount, income.frequency),
    0,
  );

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm text-slate-500 underline">
          &larr; Home
        </Link>

        <div className="mb-6 mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Income</h1>
            <p className="text-slate-600">
              Total monthly (est.): <span className="text-green-700">{formatCentavos(totalMonthly)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-slate-900 px-4 py-2 text-white"
          >
            Add income
          </button>
        </div>

        {incomes.length === 0 ? (
          <p className="text-slate-500">No income sources yet. Add your first one above.</p>
        ) : (
          <ul className="space-y-2">
            {incomes.map((income) => (
              <li
                key={income.id}
                className="flex items-center justify-between rounded-xl bg-white p-4 shadow"
              >
                <div>
                  <p className="font-medium">{income.name}</p>
                  <p className="text-sm text-green-700">
                    {formatCentavos(income.amount)}, {FREQUENCY_TEXT[income.frequency](income)}
                  </p>
                  <p className="text-sm text-slate-400">Tracked until {income.end_date}</p>
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
                        className="rounded border border-slate-300 px-3 py-1 text-sm"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setModalState(income)}
                        className="rounded border border-slate-300 px-3 py-1 text-sm"
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
    </main>
  );
}
