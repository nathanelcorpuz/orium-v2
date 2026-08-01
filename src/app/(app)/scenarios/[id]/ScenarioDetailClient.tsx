"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import { summarizeRecurrence } from "@/lib/recurrenceSummary";
import { SubmitButton } from "@/components/SubmitButton";
import { ScenarioItemModal, type ScenarioItemRow, type BalanceOption } from "../ScenarioItemModal";
import { ScenarioOneOffModal, type ScenarioOneOffRow } from "../ScenarioOneOffModal";
import { ScenarioBudgetEntryModal, type ScenarioBudgetEntryRow } from "../ScenarioBudgetEntryModal";
import {
  ScenarioBudgetModal,
  type ScenarioBudgetRow,
  type ScenarioIncomeOption,
} from "../ScenarioBudgetModal";
import {
  deleteScenarioBudget,
  deleteScenarioBudgetEntry,
  deleteScenarioItem,
  deleteScenarioOneOff,
} from "../actions";

export type { ScenarioBudgetRow } from "../ScenarioBudgetModal";

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

// T218 follow-up: a scenario budget's replenish label, matching the real
// BudgetCard's own "Connected to X" / recurrence summary / "Manual"
// wording - simplified here (no progress bar/countdown, since a scenario
// item never settles and there's nothing to count down to).
function scenarioBudgetReplenishLabel(budget: ScenarioBudgetRow, incomes: ScenarioIncomeOption[]): string {
  if (budget.linked_scenario_income_id) {
    const income = incomes.find((i) => i.id === budget.linked_scenario_income_id);
    return income ? `Connected to ${income.name}` : "Connected to income";
  }
  if (budget.start_date && budget.interval !== null && budget.unit !== null && budget.ends_type !== null) {
    return summarizeRecurrence({
      startDate: budget.start_date,
      interval: budget.interval,
      unit: budget.unit,
      weekdays: budget.weekdays,
      daysOfMonth: budget.days_of_month,
      ordinal: budget.ordinal,
      ordinalWeekday: budget.ordinal_weekday,
      endsType: budget.ends_type,
      endDate: budget.end_date,
      occurrenceCount: budget.occurrence_count,
    });
  }
  return "Replenished manually";
}

export function ScenarioDetailClient({
  scenario,
  items,
  oneOffs,
  scenarioBudgets,
  scenarioIncomes,
  entriesByBudgetId,
  balances,
}: {
  scenario: { id: string; name: string };
  items: ScenarioItemRow[];
  oneOffs: ScenarioOneOffRow[];
  scenarioBudgets: ScenarioBudgetRow[];
  // T218 follow-up: this scenario's own income items, so a scenario budget
  // can link to one - never a real income (see ScenarioBudgetModal's own
  // comment).
  scenarioIncomes: ScenarioIncomeOption[];
  entriesByBudgetId: Map<string, ScenarioBudgetEntryRow[]>;
  balances: BalanceOption[];
}) {
  const [itemModalState, setItemModalState] = useState<null | "new" | ScenarioItemRow>(null);
  const [oneOffModalState, setOneOffModalState] = useState<null | "new" | ScenarioOneOffRow>(null);
  const [confirmingDeleteItem, setConfirmingDeleteItem] = useState<string | null>(null);
  const [confirmingDeleteOneOff, setConfirmingDeleteOneOff] = useState<string | null>(null);
  const [entryModalState, setEntryModalState] = useState<
    null | { scenarioBudgetId: string; entry: ScenarioBudgetEntryRow | null }
  >(null);
  const [confirmingDeleteBudget, setConfirmingDeleteBudget] = useState<string | null>(null);
  const [confirmingDeleteEntry, setConfirmingDeleteEntry] = useState<string | null>(null);
  const [budgetModalState, setBudgetModalState] = useState<null | "new" | ScenarioBudgetRow>(null);

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

        {/* T218 follow-up (REMINDER, 2026-08-02): a scenario budget now has
            the same allocation/replenish-source functionality a real budget
            does - see ScenarioBudgetModal's own comment for the one
            deliberate exception (no budget-account link). */}
        <div className="mb-6 mt-6 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-notion-text">Budgets</h2>
          <button
            type="button"
            onClick={() => setBudgetModalState("new")}
            className="rounded bg-notion-text px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            Add budget
          </button>
        </div>

        {scenarioBudgets.length === 0 ? (
          <p className="text-slate-500">No budgets yet.</p>
        ) : (
          <ul className="space-y-2">
            {scenarioBudgets.map((budget) => {
              const entries = entriesByBudgetId.get(budget.id) ?? [];
              const total = entries.reduce(
                (sum, entry) => sum + (entry.direction === "incoming" ? entry.amount : -entry.amount),
                0,
              );
              return (
                <li key={budget.id} className="rounded-lg border border-notion-hairline bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setBudgetModalState(budget)}
                          className="font-medium text-notion-text hover:underline"
                          title="Edit"
                        >
                          {budget.name}
                        </button>
                        <span className="rounded-full bg-notion-hover px-2 py-0.5 text-xs font-medium text-slate-500">
                          {scenarioBudgetReplenishLabel(budget, scenarioIncomes)}
                        </span>
                      </div>
                      {budget.allocation > 0 && (
                        <p className="text-xs text-slate-500">
                          {formatCentavos(budget.allocation)} allocated per replenishment
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`text-sm font-medium ${total < 0 ? "text-red-600" : "text-notion-text"}`}>
                        {formatCentavos(total)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEntryModalState({ scenarioBudgetId: budget.id, entry: null })}
                        className="rounded border border-notion-hairline px-2 py-1 text-xs text-notion-text hover:bg-notion-hover"
                      >
                        Add entry
                      </button>
                      {confirmingDeleteBudget === budget.id ? (
                        <>
                          <span className="text-xs text-slate-600">Delete budget?</span>
                          <form action={deleteScenarioBudget}>
                            <input type="hidden" name="id" value={budget.id} />
                            <input type="hidden" name="scenarioId" value={scenario.id} />
                            <SubmitButton className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
                              Yes
                            </SubmitButton>
                          </form>
                          <button
                            type="button"
                            onClick={() => setConfirmingDeleteBudget(null)}
                            className="rounded border border-notion-hairline px-2 py-1 text-xs text-notion-text hover:bg-notion-hover"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteBudget(budget.id)}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {entries.length > 0 && (
                    <ul className="mt-2 divide-y divide-notion-hairline border-t border-notion-hairline pt-2">
                      {entries.map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between py-1.5 text-sm">
                          <span className="text-slate-500">
                            {formatFullDate(entry.entry_date)}
                            {entry.note && <span className="italic text-slate-400"> - {entry.note}</span>}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className={entry.direction === "incoming" ? "text-green-700" : "text-red-600"}>
                              {entry.direction === "incoming" ? "+" : "-"}
                              {formatCentavos(entry.amount)}
                            </span>
                            {confirmingDeleteEntry === entry.id ? (
                              <>
                                <form action={deleteScenarioBudgetEntry}>
                                  <input type="hidden" name="id" value={entry.id} />
                                  <input type="hidden" name="scenarioId" value={scenario.id} />
                                  <SubmitButton className="text-xs text-red-600 underline hover:text-red-700 disabled:opacity-50">
                                    Confirm
                                  </SubmitButton>
                                </form>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingDeleteEntry(null)}
                                  className="text-xs text-slate-400 hover:text-notion-text"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEntryModalState({ scenarioBudgetId: budget.id, entry })}
                                  className="text-xs text-notion-text underline hover:opacity-80"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingDeleteEntry(entry.id)}
                                  className="text-xs text-red-600 underline hover:text-red-700"
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
                </li>
              );
            })}
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
      {entryModalState !== null && (
        <ScenarioBudgetEntryModal
          scenarioId={scenario.id}
          scenarioBudgetId={entryModalState.scenarioBudgetId}
          entry={entryModalState.entry}
          onClose={() => setEntryModalState(null)}
        />
      )}
      {budgetModalState !== null && (
        <ScenarioBudgetModal
          scenarioId={scenario.id}
          budget={budgetModalState === "new" ? null : budgetModalState}
          incomes={scenarioIncomes}
          onClose={() => setBudgetModalState(null)}
        />
      )}
    </div>
  );
}
