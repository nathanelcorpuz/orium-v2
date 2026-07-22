"use client";

import { useState } from "react";
import { formatCentavos } from "@/lib/money";
import { remainingTotal } from "@/lib/engine/remaining";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { summarizeRecurrence } from "@/lib/recurrenceSummary";
import { todayInManila } from "@/lib/date";
import type { RecurringItemActionState } from "@/lib/recurringItem";
import { MonthlyGoalModal } from "./MonthlyGoalModal";
import type { MonthlyGoalRow } from "./MonthlyGoalRow";

type GoalAction = (
  prevState: RecurringItemActionState,
  formData: FormData,
) => Promise<RecurringItemActionState>;
type DeleteAction = (formData: FormData) => Promise<void>;

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
  // Debt/Savings could previously only be monthly, so summing raw amounts
  // was exact; now that any recurrence unit is possible, the total needs
  // the same monthly-equivalent estimate the Dashboard/Income pages use.
  // Goes through goalRule (not the raw row) since MonthlyGoalRow's
  // days_of_month is snake_case, matching Supabase - both functions expect
  // camelCase daysOfMonth.
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
            {items.map((item) => {
              const remaining = remainingTotal({ ...goalRule(item), amount: item.amount }, today);
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-xl bg-white p-4 shadow"
                >
                  <div>
                    <p className="font-medium">{item.name}</p>
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
