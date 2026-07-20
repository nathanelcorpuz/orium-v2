"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCentavos } from "@/lib/money";
import { remainingMonthlyTotal } from "@/lib/engine/remaining";
import { todayInManila } from "@/lib/date";
import type { RecurringItemActionState } from "@/lib/recurringItem";
import { MonthlyGoalModal } from "./MonthlyGoalModal";
import type { MonthlyGoalRow } from "./MonthlyGoalRow";

type GoalAction = (
  prevState: RecurringItemActionState,
  formData: FormData,
) => Promise<RecurringItemActionState>;
type DeleteAction = (formData: FormData) => Promise<void>;

export function MonthlyGoalsClient({
  items,
  pageTitle,
  noun,
  amountLabel,
  amountColorClass,
  createAction,
  updateAction,
  deleteAction,
}: {
  items: MonthlyGoalRow[];
  pageTitle: string;
  noun: string;
  amountLabel: string;
  amountColorClass: string;
  createAction: GoalAction;
  updateAction: GoalAction;
  deleteAction: DeleteAction;
}) {
  const [modalState, setModalState] = useState<null | "new" | MonthlyGoalRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const today = todayInManila();
  const totalMonthly = items.reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const totalRemaining = items.reduce(
    (sum, item) =>
      sum +
      remainingMonthlyTotal(
        {
          amount: item.amount,
          dayOfMonth: item.day_of_month,
          startDate: item.start_date,
          endDate: item.end_date,
        },
        today,
      ),
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
            <h1 className="text-xl font-semibold">{pageTitle}</h1>
            <p className="text-slate-600">
              Total monthly: <span className={amountColorClass}>{formatCentavos(totalMonthly)}</span>
            </p>
            <p className="text-slate-600">
              Total remaining:{" "}
              <span className={amountColorClass}>{formatCentavos(totalRemaining)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-slate-900 px-4 py-2 text-white"
          >
            Add {noun}
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-slate-500">No {noun}s yet. Add your first one above.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-xl bg-white p-4 shadow"
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className={`text-sm ${amountColorClass}`}>
                    {formatCentavos(Math.abs(item.amount))} / month, due on day {item.day_of_month}
                  </p>
                  <p className="text-sm text-slate-400">
                    {item.start_date} &rarr; {item.end_date}
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
                        className="rounded border border-slate-300 px-3 py-1 text-sm"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setModalState(item)}
                        className="rounded border border-slate-300 px-3 py-1 text-sm"
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
            ))}
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
    </main>
  );
}
