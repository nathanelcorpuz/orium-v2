"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import { summarizeRecurrence } from "@/lib/recurrenceSummary";
import { SubmitButton } from "@/components/SubmitButton";
import { ScenarioItemModal, type ScenarioItemRow, type BalanceOption } from "../ScenarioItemModal";
import { ScenarioOneOffModal, type ScenarioOneOffRow } from "../ScenarioOneOffModal";
import { ScenarioBudgetEntryModal, type ScenarioBudgetEntryRow } from "../ScenarioBudgetEntryModal";
import {
  createScenarioBudget,
  deleteScenarioBudget,
  deleteScenarioBudgetEntry,
  deleteScenarioItem,
  deleteScenarioOneOff,
  renameScenarioBudget,
  type ScenarioActionState,
} from "../actions";

export type ScenarioBudgetRow = { id: string; name: string };

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

const scenarioActionInitialState: ScenarioActionState = { error: null };

// T182: a plain inline name field, matching this file's own established
// "add" forms (ScenariosClient.tsx's CreateScenarioForm) rather than a modal
// for something this small.
function AddScenarioBudgetForm({ scenarioId }: { scenarioId: string }) {
  const [state, formAction, pending] = useActionState(createScenarioBudget, scenarioActionInitialState);
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      formRef.current?.reset();
      submitted.current = false;
    }
  }, [pending, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        submitted.current = true;
      }}
      className="mb-4 flex items-end gap-2"
    >
      <input type="hidden" name="scenarioId" value={scenarioId} />
      <div className="flex-1">
        <label className="block text-sm text-slate-600" htmlFor="budgetName">
          New budget
        </label>
        <input
          id="budgetName"
          name="name"
          type="text"
          required
          placeholder="e.g. Travel fund"
          className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
        />
      </div>
      <SubmitButton className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90 disabled:opacity-50">
        Add
      </SubmitButton>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

// T182: same rename-inline pattern RemindersPanel's edit mode uses - a
// budget name is the only field this task's scope actually needs to change
// after creation (no allocation/schedule to edit - see migration 0037).
function ScenarioBudgetName({
  scenarioId,
  budget,
}: {
  scenarioId: string;
  budget: ScenarioBudgetRow;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(renameScenarioBudget, scenarioActionInitialState);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      setEditing(false);
      submitted.current = false;
    }
  }, [pending, state]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="font-medium text-notion-text hover:underline"
        title="Rename"
      >
        {budget.name}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={() => {
        submitted.current = true;
      }}
      className="flex items-center gap-1"
    >
      <input type="hidden" name="id" value={budget.id} />
      <input type="hidden" name="scenarioId" value={scenarioId} />
      <input
        name="name"
        type="text"
        defaultValue={budget.name}
        required
        className="rounded border border-notion-hairline p-1 text-sm text-notion-text focus:border-notion-accent focus:outline-none"
      />
      <SubmitButton
        disabled={pending}
        className="rounded px-2 py-1 text-xs text-notion-accent hover:bg-notion-hover disabled:opacity-50"
      >
        Save
      </SubmitButton>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-notion-hover"
      >
        Cancel
      </button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

export function ScenarioDetailClient({
  scenario,
  items,
  oneOffs,
  scenarioBudgets,
  entriesByBudgetId,
  balances,
}: {
  scenario: { id: string; name: string };
  items: ScenarioItemRow[];
  oneOffs: ScenarioOneOffRow[];
  scenarioBudgets: ScenarioBudgetRow[];
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

        {/* T182: a scenario budget is a plain named pot - see migration
            0037's own comment for why it doesn't mirror the real Budgets
            page's allocation/replenish-schedule/linked-income model. */}
        <div className="mb-6 mt-6 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-notion-text">Budgets</h2>
        </div>
        <AddScenarioBudgetForm scenarioId={scenario.id} />

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
                    <ScenarioBudgetName scenarioId={scenario.id} budget={budget} />
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
    </div>
  );
}
