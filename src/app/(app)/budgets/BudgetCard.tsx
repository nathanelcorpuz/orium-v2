"use client";

import { useState } from "react";
import { formatCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import {
  budgetProgressFraction,
  budgetReplenishRule,
  computeBudgetAccountBalance,
  computeBudgetBalance,
  replenishProgress,
} from "@/lib/engine/budgetLedger";
import { toEngineBudget } from "@/lib/budgetView";
import { ProgressBar } from "@/components/ProgressBar";
import { SubmitButton } from "@/components/SubmitButton";
import { CheckIcon, CloseIcon, DeleteIcon, EditIcon, EyeIcon, EyeOffIcon } from "@/components/navIcons";
import { toggleRecordActive } from "@/app/(app)/toggleActive";
import { summarizeRecurrence } from "@/lib/recurrenceSummary";
import type { BudgetEntry, RecurrenceEndsType, RecurrenceUnit } from "@/lib/engine/types";
import type { BudgetRow } from "@/lib/budgetView";
import { deleteBudget } from "./actions";
import { BudgetEntriesModal } from "./BudgetEntriesModal";
import { LogSpendModal } from "./LogSpendModal";
import { FundsModal } from "./FundsModal";
import { MoveBudgetFundsModal } from "./MoveBudgetFundsModal";
import type { BudgetAccountRow } from "./BudgetAccountModal";

// Simplified, page-local shapes (SPEC.md Phase 10/T55) - the fuller
// budgetView.ts versions of these still exist for actions.ts's own
// server-side needs, but this page's UI only ever needs id/name for an
// income and id/entry_date/amount/note/direction for an entry.
export type BudgetEntryRow = {
  id: string;
  entry_date: string;
  amount: number;
  note: string | null;
  direction?: "incoming" | "outgoing";
  // T222: which connected budget account this entry touched, if any - lets
  // a budget's per-account breakdown (below) show its own attributed share
  // of each account, not the account's raw total.
  budget_account_id?: string | null;
};

// Phase 11 (T60): the recurrence rule too, not just id/name - an
// income-linked budget's progress bar resolves its schedule from whichever
// income it's linked to (budgetReplenishRule, engine/budgetLedger.ts).
export type IncomeItemRow = {
  id: string;
  name: string;
  startDate: string;
  interval: number;
  unit: RecurrenceUnit;
  weekdays: number[] | null;
  daysOfMonth: number[] | null;
  ordinal: number | null;
  ordinalWeekday: number | null;
  endsType: RecurrenceEndsType;
  endDate: string | null;
  occurrenceCount: number | null;
  // User request 2026-08-01: "budget items should show the main account
  // connected to the income connected to it" - the income's own T71 link,
  // resolved against `balances` below.
  balanceId: string | null;
};

// T165 (SPEC.md Phase 21): exported so BudgetsClient.tsx can reuse it for the
// all-budgets total, rather than a third copy of the same 6-line mapping.
export function toEngineEntries(entries: BudgetEntryRow[], budgetId: string): BudgetEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    budgetId,
    entryDate: entry.entry_date,
    amount: entry.amount,
    note: entry.note,
    direction: entry.direction,
    budgetAccountId: entry.budget_account_id,
  }));
}

type ActiveModal = null | "entries" | "log" | "add" | "take" | "move";

// T75: redesigned from always-inline entries/forms into a compact button
// row (Entries / Log spend / Add funds / Take funds), each opening its own
// small modal - a dropdown "..." menu was considered and rejected in favor
// of always-visible buttons, since a menu adds a click before a frequently-
// used action like logging a spend.
export function BudgetCard({
  budget,
  entries,
  incomes,
  balances,
  budgets,
  budgetAccounts,
  accountLinks,
  accountLinksByBudgetId,
  onEdit,
  edited,
  handledDates = [],
}: {
  budget: BudgetRow;
  entries: BudgetEntryRow[];
  incomes: IncomeItemRow[];
  // User request 2026-08-01: just enough to resolve a linked income's own
  // connected main account by id - not the full `Balance`/`BalanceRow`
  // shape, since nothing here needs an amount or a fee.
  balances: { id: string; name: string }[];
  // T203 (user request): the full budgets list, so Move funds has other
  // budgets to move to. Optional so callers that never open move mode (there
  // aren't any right now, but keeps this consistent with BudgetsClient's own
  // BudgetAccountRow[] pattern) don't have to pass it.
  budgets: BudgetRow[];
  // T204: resolves each connected link's own name/live amount below.
  budgetAccounts: BudgetAccountRow[];
  // T218: every budget account currently connected to this budget, in
  // connection order - replaces T204's single `budget.budget_account_id`.
  accountLinks: { budgetAccountId: string; replenishAmount: number }[];
  // T218 follow-up (REMINDER, 2026-08-02): every *other* budget's own
  // connected accounts too, keyed by budget id - Move funds needs this to
  // state where the money lands on whichever destination budget gets
  // picked, not just this card's own budget.
  accountLinksByBudgetId: Record<string, { budgetAccountId: string; replenishAmount: number }[]>;
  onEdit: () => void;
  edited: boolean;
  // T167: replenish occurrences already settled, so the countdown below moves
  // on instead of insisting a replenishment is still due today.
  handledDates?: string[];
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const today = todayInManila();

  // The running total only counts what's actually happened so far
  // (budgetLedger.ts) - a future-dated entry hasn't landed yet, so it
  // doesn't count here; it shows up on the Forecast page instead, same
  // pattern T43 established for future spends.
  const engineEntries = toEngineEntries(entries, budget.id);
  const balance = computeBudgetBalance(engineEntries, budget.id, today);

  const linkedIncome = budget.linked_income_id
    ? incomes.find((income) => income.id === budget.linked_income_id)
    : undefined;
  const incomeName = linkedIncome?.name;

  // Phase 11 (T60): "days until replenish", for any budget with a
  // resolvable schedule - its own ("replenish every") or its linked
  // income's. Manual budgets have neither, so replenishProgress returns
  // all-null and no countdown text renders.
  const rule = budgetReplenishRule(toEngineBudget(budget), linkedIncome ?? null);
  const progress = replenishProgress(rule, today, handledDates);
  // User follow-up (2026-07-24): the bar itself is money-based, not
  // time-based - see budgetProgressFraction's own comment. Unlike the old
  // time-only fraction, this renders for manual budgets too (previousDate/
  // nextDate both null there), not just scheduled ones.
  const barFraction = budgetProgressFraction({
    allocation: budget.allocation,
    remaining: balance,
    previousDate: progress.previousDate,
    nextDate: progress.nextDate,
    asOf: today,
  });
  // "Connected to {income}" beats a schedule summary when both are somehow
  // present (shouldn't happen - DB-enforced mutually exclusive); a
  // schedule-mode budget shows its own human-readable rule the same way
  // Bills/Income/Debt/Savings rows already do (recurrenceSummary.ts).
  // T210 (user request): "Manual" alone didn't say *what* was manual - a
  // budget replenished by hand vs. one just missing a schedule read the
  // same. "Replenished manually" is the same information, worded as an
  // action rather than a state.
  const replenishLabel = incomeName
    ? `Connected to ${incomeName}`
    : rule
      ? summarizeRecurrence(rule)
      : "Replenished manually";
  // T167: for an income-linked budget the pill above only names the income,
  // so how often it actually arrives was invisible - the user had to open the
  // income itself to find out. The rule is already resolved (it drives the
  // countdown), so this is just showing what was there. Skipped for
  // schedule-mode budgets, whose pill *is* the frequency summary already.
  const frequencyLabel = incomeName && rule ? summarizeRecurrence(rule) : null;
  // User request 2026-08-01: "budget items should show the main account
  // connected to the income connected to it" - one hop further than
  // `incomeName` above, resolved through the income's own T71 link.
  const linkedAccountName = linkedIncome?.balanceId
    ? (balances.find((balance) => balance.id === linkedIncome.balanceId)?.name ?? null)
    : null;
  // T218: every budget account this budget is connected to (T204's storage
  // layer, now many-to-many) - distinct from linkedAccountName above, which
  // is the linked income's own main account. Resolved against the live
  // `budgetAccounts` list so the account's own name is never stale.
  //
  // T222 (user request 2026-08-02): "I need to be able to easily identify
  // how much of the GCash Tatay amount only belongs to Pocket Money" - a
  // budget account can hold more than one budget's money at once (nothing
  // stops two budgets sharing an account), so the breakdown shows *this
  // budget's own attributed share* of each account (computeBudgetAccountBalance,
  // summing only entries tagged with both this budget and that account),
  // not the account's raw total balance.
  const resolvedAccountLinks = accountLinks
    .map((link) => ({
      ...link,
      account: budgetAccounts.find((account) => account.id === link.budgetAccountId),
      attributedAmount: computeBudgetAccountBalance(engineEntries, budget.id, link.budgetAccountId, today),
    }))
    .filter((link): link is typeof link & { account: BudgetAccountRow } => link.account !== undefined);
  // T175: undefined (older rows, or a fixture that never set it) means active.
  const isActive = budget.active !== false;

  return (
    <div className={`rounded-lg border border-notion-hairline bg-white p-4 ${isActive ? "" : "opacity-50 grayscale"}`}>
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-notion-text">
              {budget.name}
              {edited && (
                <span className="ml-1.5 text-slate-400" title="Edited from its usual schedule">
                  ✎
                </span>
              )}
            </p>
            <span className="rounded-full bg-notion-hover px-2 py-0.5 text-xs font-medium text-slate-500">
              {replenishLabel}
            </span>
          </div>
          {frequencyLabel && <p className="mt-0.5 text-xs text-slate-400">{frequencyLabel}</p>}
          {linkedAccountName && (
            <p className="mt-0.5 text-xs text-slate-400">From account: {linkedAccountName}</p>
          )}
          {/* T218: a single connected account keeps T211's plain label; 2+
              shows a live per-account breakdown instead, e.g. "GCash Tatay
              ₱300 · Cash Tatay ₱1,000" (user's own example). */}
          {resolvedAccountLinks.length === 1 && (
            <p className="mt-0.5 text-xs text-slate-400">
              Budget account: {resolvedAccountLinks[0].account.name}
            </p>
          )}
          {resolvedAccountLinks.length > 1 && (
            <p className="mt-0.5 text-xs text-slate-400">
              Budget accounts:{" "}
              {resolvedAccountLinks
                .map((link) => `${link.account.name} ${formatCentavos(link.attributedAmount)}`)
                .join(" · ")}
            </p>
          )}
          <p className={`text-xl font-semibold ${balance < 0 ? "text-red-600" : "text-notion-text"}`}>
            {formatCentavos(balance)}
          </p>
          {/* T167: a newly created budget correctly shows ₱0 - nothing has
              replenished into it yet - which left no sign anywhere of what it
              was actually set up to hold. Showing the configured allocation
              next to the running total answers "₱0 out of what?". Hidden when
              there's no allocation to state (a purely manual budget), rather
              than printing "of ₱0". */}
          {budget.allocation > 0 && (
            <p className="text-xs text-slate-500">
              {formatCentavos(budget.allocation)} allocated per replenishment
            </p>
          )}
          {barFraction !== null && (
            <div className="mt-1 w-full">
              <ProgressBar percent={barFraction * 100} over={false} />
              {progress.daysUntil !== null && (
                <p className="mt-0.5 text-xs text-slate-400">
                  {progress.daysUntil <= 0
                    ? "Replenishes today"
                    : `${progress.daysUntil} day${progress.daysUntil === 1 ? "" : "s"} until replenish`}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {confirmingDelete ? (
            <>
              <form action={deleteBudget}>
                <input type="hidden" name="id" value={budget.id} />
                <SubmitButton
                  title="Confirm delete"
                  aria-label="Confirm delete"
                  className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  spinnerClassName="h-3.5 w-3.5"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </SubmitButton>
              </form>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                title="Cancel"
                aria-label="Cancel"
                className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              {/* T175: matches this card's existing icon-button language
                  (T112) rather than the text-button ActiveToggle used on the
                  four recurring-item pages and Misc, which have no icon
                  buttons to match. */}
              <form action={toggleRecordActive}>
                <input type="hidden" name="kind" value="budget" />
                <input type="hidden" name="id" value={budget.id} />
                <input type="hidden" name="active" value={isActive ? "false" : "true"} />
                <SubmitButton
                  title={
                    isActive
                      ? "Temporarily switch off - excludes it from the forecast without deleting it"
                      : "Switch back on"
                  }
                  aria-label={isActive ? "Switch budget off" : "Switch budget on"}
                  className={`rounded p-1 hover:bg-notion-hover ${isActive ? "text-slate-400 hover:text-notion-text" : "text-amber-600 hover:text-amber-700"}`}
                  spinnerClassName="h-3.5 w-3.5"
                >
                  {isActive ? <EyeIcon className="h-3.5 w-3.5" /> : <EyeOffIcon className="h-3.5 w-3.5" />}
                </SubmitButton>
              </form>
              <button
                type="button"
                onClick={onEdit}
                title="Edit budget"
                aria-label="Edit budget"
                className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
              >
                <EditIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                title="Delete budget"
                aria-label="Delete budget"
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <DeleteIcon className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-notion-hairline pt-3">
        <button
          type="button"
          onClick={() => setActiveModal("entries")}
          className="rounded border border-notion-hairline px-3 py-1.5 text-sm text-notion-text hover:bg-notion-hover"
        >
          Entries
        </button>
        <button
          type="button"
          onClick={() => setActiveModal("log")}
          className="rounded border border-notion-hairline px-3 py-1.5 text-sm text-notion-text hover:bg-notion-hover"
        >
          Log spend
        </button>
        <button
          type="button"
          onClick={() => setActiveModal("add")}
          className="rounded border border-notion-hairline px-3 py-1.5 text-sm text-green-700 hover:bg-notion-hover"
        >
          Add funds
        </button>
        <button
          type="button"
          onClick={() => setActiveModal("take")}
          className="rounded border border-notion-hairline px-3 py-1.5 text-sm text-red-600 hover:bg-notion-hover"
        >
          Take funds
        </button>
        {/* T222: a move needs somewhere to go - either this budget's own
            other connected account, or a different budget entirely. */}
        {(budgets.length > 1 || resolvedAccountLinks.length > 1) && (
          <button
            type="button"
            onClick={() => setActiveModal("move")}
            className="rounded border border-notion-hairline px-3 py-1.5 text-sm text-notion-accent hover:bg-notion-hover"
          >
            Move funds
          </button>
        )}
      </div>

      {activeModal === "entries" && (
        <BudgetEntriesModal
          budgetId={budget.id}
          budgetName={budget.name}
          entries={entries}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "log" && (
        <LogSpendModal
          budgetId={budget.id}
          budgetName={budget.name}
          accounts={resolvedAccountLinks.map((link) => ({ id: link.account.id, name: link.account.name }))}
          onClose={() => setActiveModal(null)}
        />
      )}
      {(activeModal === "add" || activeModal === "take") && (
        <FundsModal
          mode={activeModal}
          budgetId={budget.id}
          budgetName={budget.name}
          accounts={resolvedAccountLinks.map((link) => ({ id: link.account.id, name: link.account.name }))}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "move" && (
        <MoveBudgetFundsModal
          budgetId={budget.id}
          budgetName={budget.name}
          accounts={resolvedAccountLinks.map((link) => ({ id: link.account.id, name: link.account.name }))}
          budgets={budgets}
          accountLinksByBudgetId={accountLinksByBudgetId}
          budgetAccounts={budgetAccounts}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}
