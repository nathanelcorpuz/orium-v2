"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatCentavos } from "@/lib/money";
import { formatFullDate, todayInManila } from "@/lib/date";
import { daysBetween } from "@/lib/engine/date-utils";
import { balanceRangeColorClass, balanceRangeTier, firstDangerLabel, lowestBalanceLabel } from "@/lib/balanceColor";
import { accountBalanceForRow, computeAccountBalancesAfterEachRow, findAccountLowestPoints } from "@/lib/engine/accountBalances";
import { computeBudgetBalance } from "@/lib/engine/budgetLedger";
import { budgetPortionByBalanceId } from "@/lib/engine/cashFlowFilter";
import { BalanceModal, type BalanceRow } from "@/app/(app)/accounts/BalanceModal";
import { AmountRangeFilter, matchesAmountFilter, type ComparisonOp } from "@/components/AmountRangeFilter";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import { accountFilterOptions, matchesAccountFilter } from "@/lib/accountFilter";
import { Modal } from "@/components/Modal";
import { DatePicker } from "@/components/DatePicker";
import { ChevronIcon } from "@/components/navIcons";
import { PreviewModeBar } from "@/components/PreviewModeBar";
import { ScenarioModeBar } from "@/components/ScenarioModeBar";
import { SubmitButton } from "@/components/SubmitButton";
import { toggleScenarioActive } from "@/app/(app)/scenarios/actions";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/forecastLabels";
import { summarizeRecurrence, budgetReplenishRuleSummary } from "@/lib/recurrenceSummary";
import type {
  ForecastRow,
  Budget,
  BudgetBalanceLink,
  BudgetEntry,
  IncomeAutoMove,
  IncomeAutoMoveOverride,
  RecurringItem,
} from "@/lib/engine/types";
import {
  buildAutoMoveOverrideByKey,
  buildAutoMoveRulesByIncomeId,
  resolveAutoMoves,
} from "./resolveAutoMoves";
import type { ConnectedItem } from "@/lib/connectedItems";
import type { LowestBalancePoint, NextTransactionBatch } from "@/lib/engine/lowestBalance";
import { EditSettleModal } from "./EditSettleModal";
import { CalendarGrid } from "./CalendarGrid";
import { RemindersPanel, type ReminderRow } from "./RemindersPanel";

// T49: the forecast list can grow into the hundreds of rows across a 3-year
// horizon with weekly/daily items - loadForecast() already fetches the full
// list server-side in one shot, so this is purely client-side incremental
// *rendering* of already-fetched data (batches revealed as the user scrolls
// near the bottom), not new pagination plumbing.
const INITIAL_VISIBLE_ROWS = 50;
const ROWS_PER_BATCH = 50;

// User request 2026-07-24: the Forecast Insights card (T81) is hideable,
// same localStorage-backed collapse pattern AppShell.tsx (T44) and
// RemindersPanel.tsx (T65) already use - a client-only preference, not a DB
// column, so no user_id/RLS needed.
const INSIGHTS_COLLAPSED_STORAGE_KEY = "orium.forecastInsightsCollapsed";

// T158: TYPE_COLOR/TYPE_LABEL moved to @/lib/forecastLabels so EditSettleModal
// can reuse them without a circular import (this file imports that modal).
const TYPE_OPTIONS: { value: ForecastRow["type"]; label: string }[] = [
  { value: "income", label: "Income" },
  { value: "bill", label: "Bill" },
  { value: "debt", label: "Debt" },
  { value: "savings", label: "Savings" },
  { value: "extra", label: "Misc" },
  { value: "budget", label: "Budget" },
];

// T90, one table since T161: drives a row's clickability -
// role/tabIndex/click/keydown - for the single date-grouped table below.
//
// T168: every row is now clickable except in preview mode. Income-linked
// budget_replenish rows used to be excluded (Phase 11/T59) because they
// settle automatically with their income and so had nothing to open. They
// have something now - a per-instance amount/date edit - and since in
// practice every budget is income-linked, leaving them unclickable would
// have made that editor unreachable. The modal still refuses to *settle*
// them; see EditSettleModal's `canSettleReplenish`.
function forecastRowProps(row: ForecastRow, isClickable: boolean, onSelect: (row: ForecastRow) => void) {
  return {
    role: isClickable ? "button" : undefined,
    tabIndex: isClickable ? 0 : undefined,
    onClick: isClickable ? () => onSelect(row) : undefined,
    onKeyDown: isClickable
      ? (event: React.KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(row);
          }
        }
      : undefined,
  } as const;
}

// `isAutoReplenish` (income-linked budget_replenish, never independently
// settleable) is its own concept from `isClickable` - T103's preview mode
// also makes every row non-clickable, but for a totally different reason,
// so it must not also dress every ordinary bill/income/debt row up in the
// "auto"-replenish italic+badge treatment meant specifically for that one
// row kind.
function ForecastNameCell({ row, isAutoReplenish }: { row: ForecastRow; isAutoReplenish: boolean }) {
  return (
    <>
      {isAutoReplenish ? <span className="italic text-slate-500">{row.name}</span> : row.name}
      {row.edited && (
        <span className="ml-1.5 text-slate-400" title="Edited from its usual schedule">
          ✎
        </span>
      )}
      {/* T155: the comment lives on the underlying bill/income/misc record,
          not on the occurrence - this surfaces it without the user having to
          open the item. Reuses the edited-indicator's icon-plus-title
          pattern directly above rather than introducing a second hover
          mechanism; `title` also means it works on touch (long-press) and is
          announced by screen readers, which a CSS-only tooltip would not. */}
      {row.comment && (
        <span className="ml-1.5 text-slate-400" title={row.comment}>
          💬
        </span>
      )}
      {isAutoReplenish && (
        <span
          className="ml-1.5 rounded-full bg-notion-hover px-1.5 py-0.5 text-xs text-slate-500"
          title="Replenishes automatically when its linked income is settled. Click the row to adjust this one occurrence."
        >
          auto
        </span>
      )}
      {/* T174: unmistakable - a hypothetical row must never read as a real
          committed transaction. Deliberately not clickable here (see
          `isClickable` below) - a scenario item's real id lives in a
          separate table EditSettleModal's actions know nothing about, so
          editing happens on /scenarios instead. */}
      {row.fromScenario && (
        <span
          className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800"
          title="Part of an active scenario, not real data - manage it from Scenarios"
        >
          scenario
        </span>
      )}
    </>
  );
}

function ForecastBalanceCell({
  balance,
  balanceRanges,
  currency,
}: {
  balance: number;
  balanceRanges: number[];
  currency: string;
}) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 ${balanceRangeColorClass(balance, balanceRanges)}`}>
      {formatCentavos(balance, currency)}
    </span>
  );
}

export function ForecastClient({
  forecast,
  forecastCashFlowOnly,
  cashFlowOnlyStartingBalance,
  balances,
  recurringItems,
  budgets,
  budgetEntries,
  budgetBalanceLinks,
  currency,
  balanceRanges,
  tierLabels,
  reminders,
  connectedItems,
  pastDueCount,
  pastDueTotal,
  balanceAfterPastDue,
  lowestBalance,
  firstDanger,
  nextTransactionBatch,
  previewMode = false,
  allScenarios,
  incomeAutoMoves = [],
  incomeAutoMoveOverrides = [],
}: {
  forecast: ForecastRow[];
  // T284 (SPEC.md Phase 49), redesigned 2026-08-08: the same forecast, with
  // every budget_replenish/budget_entry row excluded (wherever its money
  // lives - not whole accounts, so a mixed-use account keeps its ordinary
  // bills/income) - what renders when the "Exclude budgets" toggle below is
  // on. Precomputed server-side (loadForecast()) so switching the toggle is
  // instant client-side, no reload/refetch.
  forecastCashFlowOnly: ForecastRow[];
  cashFlowOnlyStartingBalance: number;
  balances: BalanceRow[];
  // T199: for the "frequency" line in EditSettleModal/CalendarGrid - a
  // recurring row's own rule, or a budget_replenish row's linked income's
  // rule (via budgetReplenishRuleSummary).
  recurringItems: RecurringItem[];
  budgets: Budget[];
  // T284: for the always-visible "Total remaining budget" figure and the
  // "Exclude budgets" toggle's per-account portion (cashFlowFilter.ts) -
  // both computed client-side so nothing here needs a server round-trip.
  budgetEntries: BudgetEntry[];
  budgetBalanceLinks: BudgetBalanceLink[];
  currency: string;
  balanceRanges: number[];
  tierLabels: string[];
  reminders: ReminderRow[];
  // T152 (Bug #12): passed straight through to `BalanceModal` so an account
  // opened from a balance chip here shows the same connected bills/income/
  // debt/savings/extras it shows when opened from the Balances page.
  connectedItems: ConnectedItem[];
  // T150 (Bug #11): the unsettled past-due backlog, summarised. Computed on
  // the server (`splitPastDue`) rather than re-derived here, so the banner
  // can never disagree with the rows it describes or with the Dashboard's
  // own past-due card.
  pastDueCount: number;
  pastDueTotal: number;
  balanceAfterPastDue: number;
  lowestBalance: LowestBalancePoint;
  firstDanger: LowestBalancePoint | null;
  // T215 (user request 2026-08-01): "days until next transaction(s) to
  // settle" - null when there's nothing real left to settle (findNextTransactionBatch
  // excludes hidden auto-move legs and scenario rows, same as the two stats above).
  nextTransactionBatch: NextTransactionBatch | null;
  // T103: opt-in sample-data preview - real financial data isn't touched by
  // any of this page's mutating controls while it's on, since `forecast`/
  // `balances`/etc. are themselves already a static fixture in that case
  // (wired by forecast/page.tsx), not real rows. Row click-to-settle, the
  // balance chips, and Reminders' add/edit/delete/complete are disabled
  // here too, on top of that - a settle/edit attempt against a fixture id
  // would just 404 against the real server actions rather than do anything
  // useful, and a reminder typed during preview would otherwise write a
  // real row tied to the account behind it.
  previewMode?: boolean;
  // T174/T183: every saved scenario, active or not - `forecast` above
  // already has every *active* one's rows merged in; this is only for the
  // "Scenarios" button/panel and the banner, never for deciding what to
  // merge (that already happened server-side).
  allScenarios: { id: string; name: string; is_active: boolean }[];
  // T212 follow-up (user request 2026-08-01): "the auto move doesn't have to
  // appear as a forecast transaction, it just needs to indicate that in the
  // transaction of the income itself" - resolved into a tag on the income's
  // own row (see `autoMovesByIncomeId` below) rather than a row of its own.
  incomeAutoMoves?: IncomeAutoMove[];
  // T224: this occurrence's own per-instance edits, if any - resolved
  // alongside `incomeAutoMoves` above via resolveAutoMoves.ts.
  incomeAutoMoveOverrides?: IncomeAutoMoveOverride[];
}) {
  const [editingBalance, setEditingBalance] = useState<BalanceRow | null>(null);
  const [selectedRow, setSelectedRow] = useState<ForecastRow | null>(null);
  const [insightsCollapsed, setInsightsCollapsed] = useState(false);
  const [scenariosPanelOpen, setScenariosPanelOpen] = useState(false);
  // T190: Table/Calendar toggle, replacing the old standalone /calendar page
  // (T164) per user request - the calendar view is unfiltered (same as the
  // old page), so the Filter button/badge only make sense in table mode.
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  // T284: defaults OFF - everything counts by default, same as before this
  // toggle existed. Switches which of the two precomputed datasets the rest
  // of this page renders (the table/calendar rows, the total balance figure
  // at the top, and the per-account balance chips) - purely a client-side
  // swap, no reload.
  const [cashFlowOnly, setCashFlowOnly] = useState(false);
  const activeScenarios = allScenarios.filter((s) => s.is_active);
  const displayedForecast = cashFlowOnly ? forecastCashFlowOnly : forecast;
  const today = todayInManila();
  // T284 (redesigned 2026-08-08): "Exclude budgets" hides budget money, not
  // whole accounts - a mixed-use account keeps showing here, just with its
  // own budget-attributed portion netted out of the figure. Every account
  // still renders (never filtered out), matching how the row list itself
  // now only drops budget-type rows, never a whole account's other rows.
  const budgetPortionByAccount = useMemo(
    () => budgetPortionByBalanceId(budgetEntries, budgetBalanceLinks, today),
    [budgetEntries, budgetBalanceLinks, today],
  );
  const displayedBalances = useMemo(
    () =>
      cashFlowOnly
        ? balances.map((balance) => ({
            ...balance,
            amount: balance.amount - (budgetPortionByAccount.get(balance.id) ?? 0),
          }))
        : balances,
    [balances, cashFlowOnly, budgetPortionByAccount],
  );
  const displayedTotalBalance = cashFlowOnly
    ? cashFlowOnlyStartingBalance
    : balances.reduce((sum, balance) => sum + balance.amount, 0);
  // T284 follow-up (user request 2026-08-08): "always put a total remaining
  // budget number somewhere in the forecast page" - the same running-total
  // math the Budgets page's own "Total across all budgets" line uses
  // (BudgetsClient.tsx), shown here regardless of the toggle above.
  const totalRemainingBudget = useMemo(
    () => budgets.reduce((sum, budget) => sum + computeBudgetBalance(budgetEntries, budget.id, today), 0),
    [budgets, budgetEntries, today],
  );

  useEffect(() => {
    // Reading localStorage during the lazy useState initializer instead
    // would avoid this effect, but its return value would then differ
    // between the server render (no `window`) and the client's first
    // render - a real hydration mismatch, not just a lint preference.
    // Setting state here, after hydration, is the correct fix for this
    // specific SSR-plus-localStorage case (same as AppShell.tsx's T44).
    if (localStorage.getItem(INSIGHTS_COLLAPSED_STORAGE_KEY) === "true") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInsightsCollapsed(true);
    }
  }, []);

  function toggleInsightsCollapsed() {
    setInsightsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(INSIGHTS_COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // T50: Forecast table filters - all client-side, filtering the
  // already-loaded `forecast` array before it feeds into T49's incremental
  // rendering below. No new server round-trip.
  // T70: the controls themselves moved into a modal (opened via a Filter
  // button) instead of an always-visible inline bar; the filtering logic
  // below is unchanged.
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<ForecastRow["type"]>>(new Set());
  // T233 (user request via REMINDER.md 2026-08-03): "should be able to
  // filter accounts in forecast page" - same multi-select shape as
  // selectedTypes above, reusing T206's accountFilter.ts helpers instead of
  // writing new matching logic.
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [amountOp, setAmountOp] = useState<ComparisonOp>("any");
  const [amountValue1, setAmountValue1] = useState("");
  const [amountValue2, setAmountValue2] = useState("");
  const [balanceOp, setBalanceOp] = useState<ComparisonOp>("any");
  const [balanceValue1, setBalanceValue1] = useState("");
  const [balanceValue2, setBalanceValue2] = useState("");

  function toggleType(type: ForecastRow["type"]) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleAccount(value: string) {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setNameFilter("");
    setSelectedTypes(new Set());
    setSelectedAccounts(new Set());
    setAmountOp("any");
    setAmountValue1("");
    setAmountValue2("");
    setBalanceOp("any");
    setBalanceValue1("");
    setBalanceValue2("");
  }

  // T70: how many distinct filter categories are active - drives both the
  // Filter button's badge and the boolean "is anything filtered at all".
  const activeFilterCount =
    (dateFrom !== "" || dateTo !== "" ? 1 : 0) +
    (nameFilter !== "" ? 1 : 0) +
    (selectedTypes.size > 0 ? 1 : 0) +
    (selectedAccounts.size > 0 ? 1 : 0) +
    (amountOp !== "any" ? 1 : 0) +
    (balanceOp !== "any" ? 1 : 0);
  const filtersActive = activeFilterCount > 0;

  // T71 follow-up: shows each row's connected account (if any) in its own
  // column.
  const balanceNameById = useMemo(() => new Map(balances.map((b) => [b.id, b.name])), [balances]);

  // T212 follow-up: which income (by recurring_items id) has auto-move
  // rules, and where they go - resolved per-occurrence (T224: an override
  // can reduce/skip/move any single date) into a hover tag on that income's
  // own row's Account column, rather than a separate visible row.
  const autoMoveRulesByIncomeId = useMemo(() => buildAutoMoveRulesByIncomeId(incomeAutoMoves), [incomeAutoMoves]);
  const autoMoveOverrideByKey = useMemo(
    () => buildAutoMoveOverrideByKey(incomeAutoMoveOverrides),
    [incomeAutoMoveOverrides],
  );
  function autoMovesForRow(row: ForecastRow) {
    if (row.sourceType !== "recurring" || row.type !== "income") return [];
    return resolveAutoMoves(row.sourceId, row.originalDate, autoMoveRulesByIncomeId, autoMoveOverrideByKey, balanceNameById);
  }

  // T180: per-account forecasted balance, resolving the "Before MVP launch"
  // discussion item of the same name - always over the full, unfiltered
  // forecast (same convention Total Balance/Peaks and Drops already use;
  // filters narrow what's displayed, not what's real). Cheap enough (one
  // pass over the same rows) to compute directly here rather than threading
  // a new prop through forecast/page.tsx.
  const accountLowestPoints = useMemo(
    () => findAccountLowestPoints(forecast, balances, todayInManila()),
    [forecast, balances],
  );

  // T191 (user request): "if a forecasted transaction has an account
  // connected to it, show me what that account's balance will be at that
  // point in time" - computed once per data load (like the lowest-point map
  // above) so opening the modal is an O(1) lookup by row identity, not a
  // fresh walk over the whole forecast per click.
  const accountBalanceAfterRow = useMemo(
    () => computeAccountBalancesAfterEachRow(forecast, balances),
    [forecast, balances],
  );

  // T199 (user request): a forecasted transaction's own recurrence
  // frequency, shown when it's clicked - for a "recurring" row, its own
  // rule; for a "budget_replenish" row, its budget's effective rule
  // (linked income's, or its own schedule). One-off/budget_entry rows have
  // no recurrence at all, so this returns null for them.
  const recurringItemsById = useMemo(
    () => new Map(recurringItems.map((item) => [item.id, item])),
    [recurringItems],
  );
  const budgetsById = useMemo(() => new Map(budgets.map((budget) => [budget.id, budget])), [budgets]);
  function frequencyForRow(row: ForecastRow): string | null {
    if (row.sourceType === "recurring") {
      const item = recurringItemsById.get(row.sourceId);
      return item ? summarizeRecurrence(item) : null;
    }
    if (row.sourceType === "budget_replenish" && row.budgetId) {
      const budget = budgetsById.get(row.budgetId);
      return budget ? budgetReplenishRuleSummary(budget, recurringItemsById) : null;
    }
    return null;
  }

  const filteredForecast = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    return displayedForecast.filter((row) => {
      // T212 follow-up: a `hidden` row (an auto-move's own debit/credit leg)
      // still counts toward runningBalance/per-account attribution above -
      // both of which walk the full unfiltered `forecast` prop - but never
      // renders as its own list item. The income row it's attached to
      // carries a tag instead (see the Account column below).
      if (row.hidden) return false;
      if (dateFrom && row.dueDate < dateFrom) return false;
      if (dateTo && row.dueDate > dateTo) return false;
      if (name && !row.name.toLowerCase().includes(name)) return false;
      if (selectedTypes.size > 0 && !selectedTypes.has(row.type)) return false;
      if (!matchesAccountFilter(row.balanceId ?? null, selectedAccounts)) return false;
      if (!matchesAmountFilter(row.amount, amountOp, amountValue1, amountValue2)) return false;
      if (!matchesAmountFilter(row.runningBalance, balanceOp, balanceValue1, balanceValue2)) return false;
      return true;
    });
  }, [
    displayedForecast,
    dateFrom,
    dateTo,
    nameFilter,
    selectedTypes,
    selectedAccounts,
    amountOp,
    amountValue1,
    amountValue2,
    balanceOp,
    balanceValue1,
    balanceValue2,
  ]);

  // Reset to the first batch whenever the filters themselves change, so a
  // narrowed result set always starts fresh rather than instantly rendering
  // however many rows happened to be revealed before the filter was applied.
  // Adjusted during render (React's documented pattern for "reset state when
  // a computed value changes") rather than in an effect, which would cause
  // an extra render pass for no benefit here.
  const filterKey = JSON.stringify([
    dateFrom,
    dateTo,
    nameFilter,
    [...selectedTypes].sort(),
    [...selectedAccounts].sort(),
    amountOp,
    amountValue1,
    amountValue2,
    balanceOp,
    balanceValue1,
    balanceValue2,
  ]);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(INITIAL_VISIBLE_ROWS);
  }

  const visibleForecast = filteredForecast.slice(0, visibleCount);

  // T90, now the only table's grouping (T161): drops the per-row Date column
  // in favor of a sticky group-header row per distinct due date - rows are
  // already sorted by date, so a single forward scan groups them without
  // re-sorting. `index` is carried along per-row for stable keys and the
  // row-props wiring above.
  const visibleGroups = useMemo(() => {
    const groups: { date: string; rows: { row: ForecastRow; index: number }[] }[] = [];
    visibleForecast.forEach((row, index) => {
      const last = groups[groups.length - 1];
      if (last && last.date === row.dueDate) {
        last.rows.push({ row, index });
      } else {
        groups.push({ date: row.dueDate, rows: [{ row, index }] });
      }
    });
    return groups;
  }, [visibleForecast]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => Math.min(count + ROWS_PER_BATCH, filteredForecast.length));
        }
      },
      { root, rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredForecast.length]);

  return (
    <div className="flex min-h-full flex-col">
      {previewMode && <PreviewModeBar />}
      {activeScenarios.length > 0 && (
        <ScenarioModeBar scenarioNames={activeScenarios.map((s) => s.name)} />
      )}
      <div data-tour="forecast-content" className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-notion-text">Forecast</h1>
            {/* T278 (user request 2026-08-04): "make Total balance bigger,
                make Balance accounts bold" - part of "focus the entire app
                on enter > forecast > review > keep clean," the number this
                whole page exists to answer given more visual weight. */}
            <p className="text-sm text-slate-500">
              Total balance{cashFlowOnly ? " (excluding budgets)" : ""}
            </p>
            <p className="text-2xl font-semibold text-notion-text">
              {formatCentavos(displayedTotalBalance, currency)}
            </p>
            {/* T284 follow-up: always visible, regardless of the toggle below
                - "how much do I have set aside across every budget right
                now," the same figure the Budgets page's own "Total across
                all budgets" line shows. */}
            {budgets.length > 0 && (
              <p className="mt-1 text-sm text-slate-500">
                Total remaining budget:{" "}
                <span className={totalRemainingBudget < 0 ? "text-red-600" : "font-medium text-notion-text"}>
                  {formatCentavos(totalRemainingBudget, currency)}
                </span>
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {displayedBalances.map((balance) => {
                // T180, made visible per user follow-up feedback (previously
                // hover-only, which was too easy to miss) - now a plain
                // second line under the balance, same wording and the same
                // stat this page's `findAccountLowestPoints` call already
                // computes, matching what the Accounts page now shows too.
                // T284: `accountLowestPoints` is always computed over the
                // full, unfiltered forecast (a per-account display stat,
                // "don't recompute anything server-side" per the toggle's
                // own spec) - only which accounts are chipped here changes.
                const lowest = accountLowestPoints.get(balance.id);
                const projectionLine =
                  lowest && lowest.date !== todayInManila()
                    ? `Lowest projected: ${formatCentavos(lowest.balance, currency)} on ${formatFullDate(lowest.date)}`
                    : lowest
                      ? `Not projected to dip below ${formatCentavos(lowest.balance, currency)}`
                      : null;
                return (
                  <button
                    key={balance.id}
                    type="button"
                    onClick={() => {
                      if (!previewMode) setEditingBalance(balance);
                    }}
                    className={`rounded-lg border border-notion-hairline bg-white px-3 py-1.5 text-left text-sm text-notion-text ${previewMode ? "" : "hover:bg-notion-hover"}`}
                  >
                    <span className="font-semibold">
                      {balance.name}: {formatCentavos(balance.amount, currency)}
                      {/* T284: same pill styling as the "Auto-debited"
                          badge (T232) for visual consistency. */}
                      {balance.used_for_budgets && (
                        <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                          Used for budgets
                        </span>
                      )}
                    </span>
                    {projectionLine && <span className="block text-xs text-slate-400">{projectionLine}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* T150 (Bug #11): a summary above the table, because the rows
              themselves are the thing most likely to be scrolled past. Only
              rendered when there actually is a backlog - a permanent "0 past
              due" line would train the user to stop seeing it. States the
              balance left after clearing it, since that is the number the
              user should actually be planning against. */}
          {pastDueCount > 0 && (
            <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4">
              <h2 className="mb-1 text-sm font-semibold text-red-800">
                {pastDueCount} past-due {pastDueCount === 1 ? "transaction" : "transactions"}
              </h2>
              <p className="text-sm text-red-700">
                Dated before today and never settled, so {pastDueCount === 1 ? "it is" : "they are"}{" "}
                still counted against your balance. Settle or remove{" "}
                {pastDueCount === 1 ? "it" : "them"} to clear this.{" "}
                {formatCentavos(Math.abs(pastDueTotal), currency)}{" "}
                {pastDueTotal < 0 ? "outstanding" : "net incoming"}, leaving{" "}
                {formatCentavos(balanceAfterPastDue, currency)} once settled.
              </p>
            </div>
          )}

          {/* User request 2026-07-24: the lowest-balance line pulled out of
              the plain-text header into its own card, styled like the
              Dashboard's stat cards - a home for this and any future
              forecast-derived helper indicators, not just this one stat. */}
          <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4" data-tour="forecast-insights">
            <button
              type="button"
              onClick={toggleInsightsCollapsed}
              aria-expanded={!insightsCollapsed}
              className={`flex w-full items-center justify-between text-sm font-semibold text-notion-text hover:opacity-80 ${insightsCollapsed ? "" : "mb-2"}`}
            >
              Forecast Insights
              <ChevronIcon
                direction="right"
                className={`h-3.5 w-3.5 text-slate-400 transition-transform ${insightsCollapsed ? "" : "rotate-90"}`}
              />
            </button>
            {!insightsCollapsed && forecast.length === 0 && balances.length === 0 && (
              // T125: with nothing entered, every stat here is derived from
              // zero, and a ₱0 balance lands in the danger tier - so this
              // card used to greet a brand-new user with a "goes negative"
              // warning about money they hadn't entered.
              <p className="text-sm text-slate-500">
                Nothing to forecast yet. Add an account and a bill or two, and this will show the
                lowest your balance gets, and when.
              </p>
            )}
            {!insightsCollapsed && (forecast.length > 0 || balances.length > 0) && (
              <div className="space-y-2">
                {/* T76: color + wording now reflect the actual balance_ranges
                    risk tier, not a hardcoded <=0 check - matches the
                    Dashboard card and this same page's Balance column (T62). */}
                <p className="text-sm text-slate-500">
                  {lowestBalanceLabel(lowestBalance.balance, balanceRanges, tierLabels)}{" "}
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 ${balanceRangeColorClass(lowestBalance.balance, balanceRanges)}`}
                  >
                    {formatCentavos(
                      balanceRangeTier(lowestBalance.balance, balanceRanges) === "danger"
                        ? Math.abs(lowestBalance.balance)
                        : lowestBalance.balance,
                      currency,
                    )}
                  </span>{" "}
                  on {formatFullDate(lowestBalance.date)}
                </p>
                {/* User feedback 2026-07-25: mirrors the Dashboard card's
                    same addition - only shown when it's a real, earlier
                    date than the lowest point above. */}
                {firstDanger && firstDanger.date !== lowestBalance.date && (
                  <p className="text-sm text-slate-500">
                    {firstDangerLabel(firstDanger.balance)}{" "}
                    <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 text-white">
                      {formatCentavos(Math.abs(firstDanger.balance), currency)}
                    </span>{" "}
                    on {formatFullDate(firstDanger.date)}
                  </p>
                )}
                {/* T215 (user request 2026-08-01): "days until next
                    transaction(s) to settle" - null when nothing real is
                    left in the horizon (findNextTransactionBatch already
                    excludes hidden auto-move legs and scenario rows). */}
                {nextTransactionBatch && (
                  <p className="text-sm text-slate-500">
                    {daysBetween(todayInManila(), nextTransactionBatch.date)} day
                    {daysBetween(todayInManila(), nextTransactionBatch.date) === 1 ? "" : "s"} until{" "}
                    {nextTransactionBatch.count} transaction{nextTransactionBatch.count === 1 ? "" : "s"} to settle
                  </p>
                )}
              </div>
            )}
          </div>

          {(forecast.length > 0 || allScenarios.length > 0) && (
            <div className="mb-4 flex flex-wrap items-center gap-3" data-tour="forecast-filter">
              {/* T190: Table/Calendar toggle, replacing the old standalone
                  /calendar page. */}
              <div className="flex overflow-hidden rounded border border-notion-hairline text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`px-3 py-1.5 ${viewMode === "table" ? "bg-notion-text text-white" : "bg-white text-notion-text hover:bg-notion-hover"}`}
                >
                  Table
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("calendar")}
                  className={`border-l border-notion-hairline px-3 py-1.5 ${viewMode === "calendar" ? "bg-notion-text text-white" : "bg-white text-notion-text hover:bg-notion-hover"}`}
                >
                  Calendar
                </button>
              </div>
              {viewMode === "table" && displayedForecast.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterModalOpen(true)}
                  className="relative flex items-center gap-1.5 rounded border border-notion-hairline bg-white px-3 py-1.5 text-xs text-notion-text hover:bg-notion-hover"
                >
                  Filter
                  {filtersActive && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-notion-accent px-1 text-[10px] font-medium text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              )}
              {/* T284, redesigned 2026-08-08: only worth showing once at
                  least one budget actually has a connected account -
                  otherwise the two datasets are always identical and the
                  toggle would do nothing. Defaults OFF (everything counts by
                  default). */}
              {budgetBalanceLinks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCashFlowOnly((prev) => !prev)}
                  className={`rounded border px-3 py-1.5 text-xs ${cashFlowOnly ? "border-notion-accent bg-notion-accent text-white" : "border-notion-hairline bg-white text-notion-text hover:bg-notion-hover"}`}
                >
                  Exclude budgets
                </button>
              )}
              {/* T183: independent per-scenario toggles, replacing the single
                  amber banner's own "Turn off" as the only control - a
                  scenario can now be switched on/off without leaving the
                  Forecast page at all. */}
              {allScenarios.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScenariosPanelOpen(true)}
                  className="relative flex items-center gap-1.5 rounded border border-notion-hairline bg-white px-3 py-1.5 text-xs text-notion-text hover:bg-notion-hover"
                >
                  Scenarios
                  {activeScenarios.length > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-medium text-amber-950">
                      {activeScenarios.length}
                    </span>
                  )}
                </button>
              )}
              {viewMode === "table" && filtersActive && (
                <>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded border border-notion-hairline px-2 py-1 text-xs text-slate-500 hover:bg-notion-hover"
                  >
                    Clear filters
                  </button>
                  <p className="text-xs text-slate-400">
                    Showing {filteredForecast.length} of {displayedForecast.length} transactions
                  </p>
                </>
              )}
            </div>
          )}

          {viewMode === "table" && filterModalOpen && (
            <Modal title="Filter transactions" onClose={() => setFilterModalOpen(false)}>
              <div className="flex flex-col gap-4">
                <div className="flex gap-2">
                  <div className="flex flex-1 flex-col gap-1">
                    <label className="text-xs text-slate-500">From</label>
                    <DatePicker
                      value={dateFrom}
                      onChange={setDateFrom}
                      className="w-full rounded border border-notion-hairline px-1.5 py-1 text-left text-xs focus:border-notion-accent focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <label className="text-xs text-slate-500">To</label>
                    <DatePicker
                      value={dateTo}
                      onChange={setDateTo}
                      className="w-full rounded border border-notion-hairline px-1.5 py-1 text-left text-xs focus:border-notion-accent focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Name</label>
                  <input
                    type="text"
                    value={nameFilter}
                    onChange={(event) => setNameFilter(event.target.value)}
                    placeholder="Search name"
                    className="w-full rounded border border-notion-hairline px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Type</label>
                  <MultiSelectChips options={TYPE_OPTIONS} selected={selectedTypes} onToggle={toggleType} />
                </div>
                {balances.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-500">Account</label>
                    <MultiSelectChips
                      options={accountFilterOptions(balances)}
                      selected={selectedAccounts}
                      onToggle={toggleAccount}
                    />
                  </div>
                )}
                <AmountRangeFilter
                  label="Amount"
                  op={amountOp}
                  value1={amountValue1}
                  value2={amountValue2}
                  onOpChange={setAmountOp}
                  onValue1Change={setAmountValue1}
                  onValue2Change={setAmountValue2}
                />
                <AmountRangeFilter
                  label="Balance"
                  op={balanceOp}
                  value1={balanceValue1}
                  value2={balanceValue2}
                  onOpChange={setBalanceOp}
                  onValue1Change={setBalanceValue1}
                  onValue2Change={setBalanceValue2}
                />
              </div>
            </Modal>
          )}

          {viewMode === "calendar" ? (
            displayedForecast.length === 0 ? (
              <p className="text-slate-500">No upcoming transactions yet.</p>
            ) : (
              <CalendarGrid
                forecast={displayedForecast}
                balances={balances}
                recurringItems={recurringItems}
                budgets={budgets}
                currency={currency}
                reminders={reminders}
                previewMode={previewMode}
                incomeAutoMoves={incomeAutoMoves}
                incomeAutoMoveOverrides={incomeAutoMoveOverrides}
              />
            )
          ) : displayedForecast.length === 0 ? (
            <p className="text-slate-500">No upcoming transactions yet.</p>
          ) : filteredForecast.length === 0 ? (
            <p className="text-slate-500">No transactions match these filters.</p>
          ) : (
            <div
              ref={scrollContainerRef}
              data-tour="forecast-table"
              // T205: mobile was capped at 50vh, leaving a lot of empty page
              // below the table before the user even started scrolling
              // through rows. 80vh keeps a little space above for the
              // Table/Calendar toggle and Filter/Scenarios buttons to stay
              // in view, while the table itself still scrolls internally
              // (this container, not the page) so the user can scroll back
              // to its own top without losing their place on the page.
              className="max-h-[80vh] overflow-auto rounded-lg border border-notion-hairline bg-white md:max-h-[70vh]"
            >
              {/* T161 (user request 2026-07-30, "make desktop match
                  mobile"): the two-table split (T90) is gone - this one
                  date-grouped table now renders at every width. Previously
                  desktop got a separate wide table with its own Date column
                  and no grouping; that table is deleted rather than kept
                  around unused, since two implementations of the same rows
                  is exactly the failure mode that caused Bug #12. Type
                  becomes visible from `sm` and Account from `md` exactly as
                  they already did below `lg` - at `lg`+ (desktop) both
                  breakpoints are already satisfied, so desktop shows every
                  column with no further changes needed here. Sequenced after
                  T150 (past-due grouping) and T155 (row polish) so this pass
                  doesn't restyle the same rows twice. */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-notion-hairline text-left text-slate-500">
                    <th className="sticky top-0 z-20 bg-white px-2 py-1.5">Name</th>
                    <th className="sticky top-0 z-20 hidden bg-white px-2 py-1.5 sm:table-cell">Type</th>
                    <th className="sticky top-0 z-20 hidden bg-white px-2 py-1.5 md:table-cell">Account</th>
                    <th className="sticky top-0 z-20 bg-white px-2 py-1.5 text-right">Amount</th>
                    <th className="sticky top-0 z-20 bg-white px-2 py-1.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGroups.map((group) => (
                    <Fragment key={group.date}>
                      <tr>
                        {/* T150 (Bug #11): every row in a group shares its
                            date, so the first row's flag decides the whole
                            header. Overdue days get the alarm treatment on
                            the header itself, since on a narrow screen the
                            header is what the user reads first. */}
                        <td
                          colSpan={5}
                          className={`sticky top-[29px] z-10 border-b px-2 py-1 font-semibold ${
                            group.rows[0]?.row.pastDue
                              ? "border-red-200 bg-red-100 text-red-800"
                              : group.rows[0]?.row.dueToday
                                ? "border-amber-200 bg-amber-100 text-amber-900"
                                : "border-notion-hairline bg-slate-50 text-slate-600"
                          }`}
                        >
                          {formatFullDate(group.date)}
                          {group.rows[0]?.row.pastDue && (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide">
                              Past due
                            </span>
                          )}
                          {/* T173: same header treatment for today. */}
                          {group.rows[0]?.row.dueToday && (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide">
                              Due today
                            </span>
                          )}
                        </td>
                      </tr>
                      {group.rows.map(({ row, index }) => {
                        const isAutoReplenish =
                          row.sourceType === "budget_replenish" && row.budgetSettleable !== true;
                        // T174: a scenario row's `sourceId` is a
                        // scenario_recurring_items/scenario_one_off_items id,
                        // not a real recurring_items/one_off_items one -
                        // EditSettleModal's actions would write an override/
                        // settlement referencing an id that doesn't exist in
                        // the real tables. Must stay non-clickable here;
                        // editing happens on /scenarios instead.
                        const isClickable = !previewMode && !row.fromScenario;
                        return (
                          <tr
                            key={`${row.sourceType}-${row.sourceId}-${row.originalDate}-${index}`}
                            {...forecastRowProps(row, isClickable, setSelectedRow)}
                            className={`border-b border-notion-hairline text-notion-text last:border-0 ${isClickable ? "cursor-pointer hover:opacity-80" : ""} ${row.pastDue ? "bg-red-50" : row.dueToday ? "bg-amber-50" : row.fromScenario ? "bg-amber-50/60" : ""}`}
                          >
                            <td className="px-2 py-1.5">
                              <ForecastNameCell row={row} isAutoReplenish={isAutoReplenish} />
                            </td>
                            <td className={`hidden px-2 py-1.5 sm:table-cell ${TYPE_COLOR[row.type]}`}>
                              {TYPE_LABEL[row.type]}
                            </td>
                            <td className="hidden px-2 py-1.5 text-slate-500 md:table-cell">
                              {row.balanceId ? (balanceNameById.get(row.balanceId) ?? "-") : "-"}
                              {/* T212 follow-up: a tag rather than a second
                                  visible row - hover for the destination(s)
                                  and amount(s), same information the
                                  EditSettleModal detail panel shows when
                                  this row is actually clicked. */}
                              {(() => {
                                const rowAutoMoves = autoMovesForRow(row).filter((m) => !m.skipped);
                                if (rowAutoMoves.length === 0) return null;
                                return (
                                  <span
                                    className="ml-1 rounded-full bg-notion-hover px-1.5 py-0.5 text-[10px] font-medium text-notion-accent"
                                    title={rowAutoMoves
                                      .map((m) => `Auto-moves ${formatCentavos(m.amount, currency)} to ${m.destinationName}`)
                                      .join("; ")}
                                  >
                                    auto-move
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {formatCentavos(row.amount, currency)}
                              {/* T172: a separate, visible line rather than
                                  folding the fee into `amount` - that value
                                  should always match the underlying bill/
                                  income/misc record. The running balance
                                  already accounts for it either way. */}
                              {row.feeAmount ? (
                                <span className="block text-xs text-slate-400">
                                  - {formatCentavos(row.feeAmount, currency)} fee
                                </span>
                              ) : null}
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium">
                              <ForecastBalanceCell
                                balance={row.runningBalance}
                                balanceRanges={balanceRanges}
                                currency={currency}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>

              {visibleCount < filteredForecast.length && (
                <div ref={sentinelRef} className="p-2 text-center text-xs text-slate-400">
                  Loading more…
                </div>
              )}
            </div>
          )}
        </div>
      </div>

        <RemindersPanel reminders={reminders} readOnly={previewMode} />
      </div>

      {editingBalance && (
        <BalanceModal
          balance={editingBalance}
          connectedItems={connectedItems.filter((item) => item.balanceId === editingBalance.id)}
          balances={balances}
          onClose={() => setEditingBalance(null)}
        />
      )}

      {selectedRow && (
        <EditSettleModal
          row={selectedRow}
          currency={currency}
          balances={balances}
          accountBalanceAtRow={accountBalanceForRow(selectedRow, accountBalanceAfterRow)}
          frequencySummary={frequencyForRow(selectedRow)}
          autoMoves={
            selectedRow.sourceType === "recurring" && selectedRow.type === "income"
              ? autoMovesForRow(selectedRow)
              : null
          }
          onClose={() => setSelectedRow(null)}
        />
      )}

      {/* T183: every saved scenario, each with its own independent toggle -
          flipping one immediately updates the forecast table (the form
          revalidates this page, same as every other action here). */}
      {scenariosPanelOpen && (
        <Modal title="Scenarios" onClose={() => setScenariosPanelOpen(false)}>
          {allScenarios.length === 0 ? (
            <p className="text-sm text-slate-500">No scenarios yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-notion-hairline overflow-y-auto">
              {allScenarios.map((scenario) => (
                <li key={scenario.id} className="flex items-center justify-between gap-2 py-2 text-sm first:pt-0">
                  <span className="min-w-0 truncate text-notion-text">{scenario.name}</span>
                  <form action={toggleScenarioActive} className="shrink-0">
                    <input type="hidden" name="scenarioId" value={scenario.id} />
                    <input type="hidden" name="active" value={scenario.is_active ? "false" : "true"} />
                    <SubmitButton
                      className={`rounded border px-3 py-1 text-xs ${
                        scenario.is_active
                          ? "border-amber-500 bg-amber-500 text-amber-950 hover:opacity-90"
                          : "border-notion-hairline text-notion-text hover:bg-notion-hover"
                      }`}
                    >
                      {scenario.is_active ? "On" : "Off"}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 border-t border-notion-hairline pt-3 text-right">
            <Link href="/scenarios" className="text-sm text-notion-accent hover:underline">
              Manage scenarios &rarr;
            </Link>
          </div>
        </Modal>
      )}
    </div>
  );
}
