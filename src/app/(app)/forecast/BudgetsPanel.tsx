"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import { computeBudgetCycleStatus } from "@/lib/engine/budgetCycles";
import type { Budget, BudgetEntry, ForecastRow, OccurrenceOverride, RecurringItem } from "@/lib/engine/types";
import { ProgressBar } from "@/components/ProgressBar";
import { logSpend, type BudgetActionState } from "@/app/(app)/budgets/actions";

const initialLogState: BudgetActionState = { error: null };

// Sidebar summary of each budget's current cycle (SPEC.md T39 Forecast
// panel), above Reminders. The full entries list / delete / replenish-source
// editing stays on the Budgets page (/budgets) - this is a compact status +
// quick-log view, mirroring how the Reminders sidebar panel relates to a
// fuller CRUD page elsewhere.
function BudgetPanelItem({
  budget,
  entries,
  recurringItems,
  overrides,
  nextCycleStart,
  today,
  currency,
}: {
  budget: Budget;
  entries: BudgetEntry[];
  recurringItems: RecurringItem[];
  overrides: OccurrenceOverride[];
  nextCycleStart: string | null;
  today: string;
  currency: string;
}) {
  const status = computeBudgetCycleStatus(budget, entries, recurringItems, overrides, today);
  const available = status.allocation + status.carriedIn;
  const progressPercent =
    available > 0 ? Math.min((status.spent / available) * 100, 100) : status.spent > 0 ? 100 : 0;

  const incomeName = budget.linkedIncomeId
    ? recurringItems.find((item) => item.id === budget.linkedIncomeId)?.name
    : undefined;

  let statusLine: string;
  if (status.over > 0) {
    statusLine = `Over by ${formatCentavos(status.over, currency)} · next cycle starts at ${formatCentavos(budget.allocation, currency)}`;
  } else if (status.source === "linked_income") {
    statusLine = `resets with ${incomeName ?? "linked income"}${nextCycleStart ? ` · ${formatFullDate(nextCycleStart)}` : ""}`;
  } else {
    statusLine = `${formatCentavos(status.remaining, currency)} left${nextCycleStart ? ` · resets ${formatFullDate(nextCycleStart)}` : ""}`;
  }

  const [logState, logAction, logPending] = useActionState(logSpend, initialLogState);
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !logPending && !logState.error) {
      formRef.current?.reset();
      submitted.current = false;
    }
  }, [logPending, logState]);

  return (
    <li className="border-b border-notion-hairline pb-3 last:border-0 last:pb-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-notion-text">{budget.name}</p>
        {status.carriedIn !== 0 && (
          <span className="shrink-0 rounded-full bg-notion-hover px-2 py-0.5 text-xs font-medium text-notion-budget">
            {status.carriedIn > 0 ? "+" : ""}
            {formatCentavos(status.carriedIn, currency)} carried over
          </span>
        )}
      </div>

      <ProgressBar percent={progressPercent} over={status.over > 0} className="mb-1 h-1.5" />
      <p className={`mb-2 text-xs ${status.over > 0 ? "font-medium text-red-600" : "text-slate-500"}`}>
        {statusLine}
      </p>

      <form
        ref={formRef}
        action={logAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-1.5"
      >
        <input type="hidden" name="budgetId" value={budget.id} />
        <input type="hidden" name="budgetName" value={budget.name} />
        <input type="hidden" name="entryDate" value={today} />
        <div className="flex gap-1.5">
          <input
            name="amountPesos"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="Amount"
            aria-label={`Log spend amount for ${budget.name}`}
            className="w-20 rounded border border-notion-hairline p-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
          />
          <input
            name="note"
            type="text"
            placeholder="Note (optional)"
            aria-label={`Log spend note for ${budget.name}`}
            className="min-w-0 flex-1 rounded border border-notion-hairline p-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={logPending}
          className="w-full rounded bg-notion-text py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
        >
          {logPending ? "Logging..." : "Log spend"}
        </button>
      </form>
      {logState.error && <p className="mt-1 text-xs text-red-600">{logState.error}</p>}
    </li>
  );
}

export function BudgetsPanel({
  budgets,
  budgetEntries,
  recurringItems,
  overrides,
  forecast,
  today,
  currency,
}: {
  budgets: Budget[];
  budgetEntries: BudgetEntry[];
  recurringItems: RecurringItem[];
  overrides: OccurrenceOverride[];
  forecast: ForecastRow[];
  today: string;
  currency: string;
}) {
  return (
    <aside className="w-full shrink-0 rounded-lg border border-notion-hairline bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-notion-text">Budgets</h2>
        <Link href="/budgets" className="text-xs text-notion-accent underline">
          Manage
        </Link>
      </div>
      {budgets.length === 0 ? (
        <p className="text-sm text-slate-400">No budgets yet.</p>
      ) : (
        <ul className="space-y-3">
          {budgets.map((budget) => {
            const entries = budgetEntries.filter((entry) => entry.budgetId === budget.id);
            // Every future budget row in the forecast is a cycle boundary
            // (SPEC.md "Forecast integration") - the earliest one after
            // today is this budget's next reset date, already computed by
            // generateForecast, no need to re-derive it here.
            const nextCycleStart =
              forecast.find(
                (row) => row.sourceType === "budget" && row.sourceId === budget.id && row.dueDate > today,
              )?.dueDate ?? null;

            return (
              <BudgetPanelItem
                key={budget.id}
                budget={budget}
                entries={entries}
                recurringItems={recurringItems}
                overrides={overrides}
                nextCycleStart={nextCycleStart}
                today={today}
                currency={currency}
              />
            );
          })}
        </ul>
      )}
    </aside>
  );
}
