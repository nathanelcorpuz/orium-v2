"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import { summarizeRecurrence } from "@/lib/recurrenceSummary";
import { SubmitButton } from "@/components/SubmitButton";
import { ScenarioItemModal, type ScenarioItemRow, type BalanceOption } from "../ScenarioItemModal";
import { ScenarioOneOffModal, type ScenarioOneOffRow } from "../ScenarioOneOffModal";
import { deleteScenarioItem, deleteScenarioOneOff } from "../actions";

const TYPE_COLOR: Record<ScenarioItemRow["type"], string> = {
  income: "text-green-700",
  debt: "text-orange-700",
  savings: "text-blue-700",
  bill: "text-notion-text",
};

function itemRule(item: ScenarioItemRow) {
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

export function ScenarioDetailClient({
  scenario,
  items,
  oneOffs,
  balances,
}: {
  scenario: { id: string; name: string };
  items: ScenarioItemRow[];
  oneOffs: ScenarioOneOffRow[];
  balances: BalanceOption[];
}) {
  const [itemModalState, setItemModalState] = useState<null | "new" | ScenarioItemRow>(null);
  const [oneOffModalState, setOneOffModalState] = useState<null | "new" | ScenarioOneOffRow>(null);
  const [confirmingDeleteItem, setConfirmingDeleteItem] = useState<string | null>(null);
  const [confirmingDeleteOneOff, setConfirmingDeleteOneOff] = useState<string | null>(null);

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <Link href="/scenarios" className="text-sm text-notion-accent hover:underline">
            &larr; All scenarios
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-notion-text">{scenario.name}</h1>
          <p className="text-slate-500">
            Bills, income, debt, and savings items here only count while this scenario is turned
            on - manage that from the scenarios list.
          </p>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-notion-text">Recurring items</h2>
          <button
            type="button"
            onClick={() => setItemModalState("new")}
            className="rounded bg-notion-text px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            Add item
          </button>
        </div>

        {items.length === 0 ? (
          <p className="mb-6 text-slate-500">No recurring items yet.</p>
        ) : (
          <ul className="mb-6 space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-notion-hairline bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-notion-text">
                    {item.name} <span className={`text-xs ${TYPE_COLOR[item.type]}`}>{item.type}</span>
                  </p>
                  <p className={`text-sm ${TYPE_COLOR[item.type]}`}>{formatCentavos(Math.abs(item.amount))}</p>
                  <p className="text-sm text-slate-400">{summarizeRecurrence(itemRule(item))}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {confirmingDeleteItem === item.id ? (
                    <>
                      <span className="text-sm text-slate-600">Delete?</span>
                      <form action={deleteScenarioItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="scenarioId" value={scenario.id} />
                        <SubmitButton className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                          Yes
                        </SubmitButton>
                      </form>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteItem(null)}
                        className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setItemModalState(item)}
                        className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteItem(item.id)}
                        className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
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

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-notion-text">Misc (one-off) items</h2>
          <button
            type="button"
            onClick={() => setOneOffModalState("new")}
            className="rounded bg-notion-text px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            Add misc item
          </button>
        </div>

        {oneOffs.length === 0 ? (
          <p className="text-slate-500">No misc items yet.</p>
        ) : (
          <ul className="space-y-2">
            {oneOffs.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-notion-hairline bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-notion-text">{item.name}</p>
                  <p className={`text-sm ${item.amount < 0 ? "text-purple-700" : "text-green-700"}`}>
                    {formatCentavos(item.amount)}
                  </p>
                  <p className="text-sm text-slate-400">Due {formatFullDate(item.due_date)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {confirmingDeleteOneOff === item.id ? (
                    <>
                      <span className="text-sm text-slate-600">Delete?</span>
                      <form action={deleteScenarioOneOff}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="scenarioId" value={scenario.id} />
                        <SubmitButton className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                          Yes
                        </SubmitButton>
                      </form>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteOneOff(null)}
                        className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setOneOffModalState(item)}
                        className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteOneOff(item.id)}
                        className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
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
      </div>

      {itemModalState !== null && (
        <ScenarioItemModal
          scenarioId={scenario.id}
          item={itemModalState === "new" ? null : itemModalState}
          balances={balances}
          onClose={() => setItemModalState(null)}
        />
      )}
      {oneOffModalState !== null && (
        <ScenarioOneOffModal
          scenarioId={scenario.id}
          item={oneOffModalState === "new" ? null : oneOffModalState}
          balances={balances}
          onClose={() => setOneOffModalState(null)}
        />
      )}
    </div>
  );
}
