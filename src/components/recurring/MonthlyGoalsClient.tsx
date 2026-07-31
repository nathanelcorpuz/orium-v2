"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { remainingTotal } from "@/lib/engine/remaining";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { goalProgress } from "@/lib/engine/goalProgress";
import { startDateLabel, summarizeRecurrence } from "@/lib/recurrenceSummary";
import { todayInManila } from "@/lib/date";
import { DatePicker } from "@/components/DatePicker";
import { AmountRangeFilter, matchesAmountFilter, type ComparisonOp } from "@/components/AmountRangeFilter";
import { accountFilterOptions, matchesAccountFilter } from "@/lib/accountFilter";
import { AmountSortControl, sortByAmount, type SortOrder } from "@/components/AmountSortControl";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import { ProgressBar } from "@/components/ProgressBar";
import { ReorderButtons } from "@/components/ReorderButtons";
import { SubmitButton } from "@/components/SubmitButton";
import { ActiveToggle } from "@/components/ActiveToggle";
import { ChevronIcon } from "@/components/navIcons";
import type { ForecastRow, RecurrenceUnit } from "@/lib/engine/types";
import type { RecurringItemActionState } from "@/lib/recurringItem";
import { useOrderedList } from "@/lib/useOrderedList";
import { MonthlyGoalModal, type BalanceOption } from "./MonthlyGoalModal";
import { ItemTransactionsModal, type SettlementRow } from "./ItemTransactionsModal";
import type { MonthlyGoalRow } from "./MonthlyGoalRow";

type GoalAction = (
  prevState: RecurringItemActionState,
  formData: FormData,
) => Promise<RecurringItemActionState>;
type DeleteAction = (formData: FormData) => Promise<void>;

const UNIT_OPTIONS: { value: RecurrenceUnit; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

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
  editedIds,
  balances,
  upcomingByItemId,
  paidByItemId,
}: {
  items: MonthlyGoalRow[];
  pageTitle: string;
  noun: string;
  amountLabel: string;
  amountColorClass: string;
  createAction: GoalAction;
  updateAction: GoalAction;
  deleteAction: DeleteAction;
  editedIds: Set<string>;
  balances: BalanceOption[];
  upcomingByItemId: Map<string, ForecastRow[]>;
  paidByItemId: Map<string, SettlementRow[]>;
}) {
  const [modalState, setModalState] = useState<null | "new" | MonthlyGoalRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<MonthlyGoalRow | null>(null);

  // T52: filter bar (name, amount range, recurrence unit) shared by both
  // Debt and Savings since they both render through this one component.
  const [nameFilter, setNameFilter] = useState("");
  const [selectedUnits, setSelectedUnits] = useState<Set<RecurrenceUnit>>(new Set());
  // T178: filter by start date range - matches Misc's existing due-date
  // range and Forecast's date filter; a recurring item's start_date is the
  // one date field it exposes directly.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountOp, setAmountOp] = useState<ComparisonOp>("any");
  const [amountValue1, setAmountValue1] = useState("");
  const [amountValue2, setAmountValue2] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("none");
  // T159: filter by connected account (T71 balance_id).
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  function toggleAccount(accountId: string) {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  function toggleUnit(unit: RecurrenceUnit) {
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unit)) next.delete(unit);
      else next.add(unit);
      return next;
    });
  }

  function clearFilters() {
    setNameFilter("");
    setSelectedUnits(new Set());
    setDateFrom("");
    setDateTo("");
    setAmountOp("any");
    setAmountValue1("");
    setAmountValue2("");
    setSelectedAccounts(new Set());
  }

  const filtersActive =
    nameFilter !== "" ||
    selectedUnits.size > 0 ||
    dateFrom !== "" ||
    dateTo !== "" ||
    amountOp !== "any" ||
    selectedAccounts.size > 0;

  // T145: persisted custom row order (up/down buttons), keyed by pageTitle
  // ("Debt"/"Savings") since this one component serves both pages - only
  // meaningful as the base ordering when nothing else is already imposing
  // one.
  const { orderedItems: orderedGoalItems, moveUp, moveDown } = useOrderedList(
    `orium.${pageTitle.toLowerCase()}Order`,
    items,
    (item) => item.id,
  );
  // T160: `completedItems.length > 0` is folded in below, once that's
  // computed - see the comment there for why.

  // T71 follow-up: shows the connected account's name (if any) on each row.
  const balanceNameById = useMemo(() => new Map(balances.map((b) => [b.id, b.name])), [balances]);

  const filteredItems = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    return orderedGoalItems.filter((item) => {
      if (name && !item.name.toLowerCase().includes(name)) return false;
      if (selectedUnits.size > 0 && !selectedUnits.has(item.unit)) return false;
      if (dateFrom && item.start_date < dateFrom) return false;
      if (dateTo && item.start_date > dateTo) return false;
      if (!matchesAmountFilter(item.amount, amountOp, amountValue1, amountValue2)) return false;
      if (!matchesAccountFilter(item.balance_id, selectedAccounts)) return false;
      return true;
    });
  }, [
    orderedGoalItems,
    nameFilter,
    selectedUnits,
    dateFrom,
    dateTo,
    amountOp,
    amountValue1,
    amountValue2,
    selectedAccounts,
  ]);

  const sortedItems = useMemo(
    () => sortByAmount(filteredItems, sortOrder, (item) => item.amount),
    [filteredItems, sortOrder],
  );

  const today = todayInManila();

  // T160 (SPEC.md Phase 20, user request "give completed debts/savings
  // somewhere to go, separate from History"): a debt or savings item is
  // complete once every occurrence its rule will ever produce has been
  // settled (T72's own definition - `goalProgress`'s fraction reaches 1 -
  // debt/savings items are DB-enforced to always have a finite total, so
  // this is always computable, never stuck at "Ongoing"). Split out of the
  // main list into its own section below rather than just tagged in place,
  // since the point is to get a paid-off debt or a reached goal out of the
  // way of the list the user actually acts on day to day.
  const [activeItems, completedItems] = useMemo(() => {
    const active: MonthlyGoalRow[] = [];
    const completed: MonthlyGoalRow[] = [];
    for (const item of sortedItems) {
      const progress = goalProgress(goalRule(item), paidByItemId.get(item.id)?.length ?? 0);
      (progress.total > 0 && progress.fraction === 1 ? completed : active).push(item);
    }
    return [active, completed];
  }, [sortedItems, paidByItemId]);

  // T160: reordering has to stay off whenever a completed item exists, even
  // with no filter or sort active. `moveUp`/`moveDown` reorder within the
  // full persisted order (`orderedGoalItems`), which still has completed
  // items interspersed - the active list only *displays* a subset of it. A
  // "move up" near that boundary would swap against a completed neighbor the
  // user can't see, moving it in a way nothing on screen explains. Same
  // reasoning `filtersActive` already disables reordering for.
  const canReorder = sortOrder === "none" && !filtersActive && completedItems.length === 0;

  // Collapsed by default, same localStorage-backed pattern as T81's Forecast
  // Insights and T44's sidebar collapse - a client-only preference, not a DB
  // column. Keyed by pageTitle since Debt and Savings are two independent
  // pages sharing this one component.
  const completedStorageKey = `orium.${pageTitle.toLowerCase()}CompletedCollapsed`;
  const [completedCollapsed, setCompletedCollapsed] = useState(true);

  useEffect(() => {
    // Reading localStorage during the lazy useState initializer would create
    // a real hydration mismatch (no `window` on the server render) - setting
    // state here, after hydration, is the fix (T44/T81's own pattern).
    if (localStorage.getItem(completedStorageKey) === "false") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompletedCollapsed(false);
    }
  }, [completedStorageKey]);

  function toggleCompletedCollapsed() {
    setCompletedCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(completedStorageKey, String(next));
      return next;
    });
  }
  // Debt/Savings could previously only be monthly, so summing raw amounts
  // was exact; now that any recurrence unit is possible, the total needs
  // the same monthly-equivalent estimate the Dashboard/Income pages use.
  // Goes through goalRule (not the raw row) since MonthlyGoalRow's
  // days_of_month is snake_case, matching Supabase - both functions expect
  // camelCase daysOfMonth. Always over the full unfiltered list - filters
  // narrow what's displayed, not what counts toward the page's own totals.
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
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <div data-tour={`${pageTitle.toLowerCase()}-header`} className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">{pageTitle}</h1>
            <p className="text-slate-500">
              Total monthly: <span className={amountColorClass}>{formatCentavos(totalMonthly)}</span>
            </p>
            <p className="text-slate-500">
              Total remaining:{" "}
              <span className={amountColorClass}>{formatCentavos(totalRemaining)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
          >
            Add {noun}
          </button>
        </div>

        {items.length > 0 && (
          <div className="mb-4 rounded-lg border border-notion-hairline bg-white p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Name</label>
                <input
                  type="text"
                  value={nameFilter}
                  onChange={(event) => setNameFilter(event.target.value)}
                  placeholder="Search name"
                  className="w-32 rounded border border-notion-hairline px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Recurs</label>
                <MultiSelectChips options={UNIT_OPTIONS} selected={selectedUnits} onToggle={toggleUnit} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Start from</label>
                <DatePicker
                  value={dateFrom}
                  onChange={setDateFrom}
                  className="rounded border border-notion-hairline px-1.5 py-1 text-left text-xs focus:border-notion-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Start to</label>
                <DatePicker
                  value={dateTo}
                  onChange={setDateTo}
                  className="rounded border border-notion-hairline px-1.5 py-1 text-left text-xs focus:border-notion-accent focus:outline-none"
                />
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
              <AmountSortControl value={sortOrder} onChange={setSortOrder} />
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded border border-notion-hairline px-2 py-1 text-xs text-slate-500 hover:bg-notion-hover"
                >
                  Clear filters
                </button>
              )}
            </div>
            {filtersActive && (
              <p className="mt-2 text-xs text-slate-400">
                Showing {filteredItems.length} of {items.length} {noun}s
              </p>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-slate-500">No {noun}s yet. Add your first one above.</p>
        ) : sortedItems.length === 0 ? (
          <p className="text-slate-500">No {noun}s match these filters.</p>
        ) : activeItems.length === 0 ? (
          // T160: every item matching the current filters is complete - a
          // real, if unusual, state (every debt paid off, every goal
          // reached). Distinct from "No {noun}s match these filters" above,
          // which means nothing at all matched.
          <p className="text-slate-500">
            Every {noun} here is complete - see the Completed section below.
          </p>
        ) : (
          <ul className="space-y-2">
            {activeItems.map((item, index) => {
              const remaining = remainingTotal({ ...goalRule(item), amount: item.amount }, today);
              // T156: start date prefixed the same way Bills/Income now show it.
              const metaLine = `${startDateLabel(goalRule(item))} · ${summarizeRecurrence(goalRule(item))} · ${
                remaining === null ? "Ongoing" : `${formatCentavos(remaining)} remaining`
              }`;
              // T72: debt/savings items always have a finite end (DB-enforced),
              // so settled/total occurrences is always computable.
              const progress = goalProgress(goalRule(item), paidByItemId.get(item.id)?.length ?? 0);
              return (
                <li
                  key={item.id}
                  className={`flex items-center justify-between rounded-lg border border-notion-hairline bg-white p-4 ${item.active === false ? "opacity-50 grayscale" : ""}`}
                >
                  {canReorder && (
                    <ReorderButtons
                      onMoveUp={() => moveUp(item.id)}
                      onMoveDown={() => moveDown(item.id)}
                      isFirst={index === 0}
                      isLast={index === activeItems.length - 1}
                    />
                  )}
                  {/* User request 2026-07-24: clicking an item (not its
                      Edit/Delete buttons, which sit in a sibling div below)
                      opens its upcoming/paid transactions view. */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setViewingItem(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setViewingItem(item);
                      }
                    }}
                    className="min-w-0 flex-1 cursor-pointer hover:opacity-80"
                  >
                    {/* T71 follow-up: the connected account moved from a
                        run-on text line into its own pill badge next to the
                        name (matching the Budgets page's "Connected to
                        {income}" pill). */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-medium text-notion-text">
                        {item.name}
                        {item.active === false && (
                          <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                            Off
                          </span>
                        )}
                        {editedIds.has(item.id) && (
                          <span className="ml-1.5 text-slate-400" title="Edited from its usual schedule">
                            ✎
                          </span>
                        )}
                      </p>
                      {item.balance_id && (
                        <span className="rounded-full bg-notion-hover px-2 py-0.5 text-xs font-medium text-slate-500">
                          {balanceNameById.get(item.balance_id) ?? "-"}
                        </span>
                      )}
                    </div>
                    <p className={`mt-1 text-sm ${amountColorClass}`}>{formatCentavos(Math.abs(item.amount))}</p>
                    <p className="text-sm text-slate-400">{metaLine}</p>
                    <div className="mt-1.5 w-full">
                      <ProgressBar percent={progress.fraction * 100} over={false} />
                      <p className="mt-0.5 text-xs text-slate-400">
                        {progress.settled} of {progress.total} settled
                      </p>
                    </div>
                    {item.comments && (
                      <p className="mt-1 text-sm italic text-slate-400">{item.comments}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {confirmingDeleteId === item.id ? (
                      <>
                        <span className="text-sm text-slate-600">Delete?</span>
                        <form action={deleteAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <SubmitButton className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                            Yes
                          </SubmitButton>
                        </form>
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(null)}
                          className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setModalState(item)}
                          className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                        >
                          Edit
                        </button>
                        <ActiveToggle kind="recurring" id={item.id} active={item.active !== false} />
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(item.id)}
                          className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
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

        {/* T160: a fully-settled debt or savings goal moves here rather than
            staying in the active list above or only being visible as
            settlements in History. Collapsed by default - this is a
            "nothing left to do" archive, not something acted on regularly. */}
        {completedItems.length > 0 && (
          <div className="mt-6 rounded-lg border border-notion-hairline bg-white p-4">
            <button
              type="button"
              onClick={toggleCompletedCollapsed}
              aria-expanded={!completedCollapsed}
              className={`flex w-full items-center justify-between text-sm font-semibold text-notion-text hover:opacity-80 ${completedCollapsed ? "" : "mb-2"}`}
            >
              Completed ({completedItems.length})
              <ChevronIcon
                direction="right"
                className={`h-3.5 w-3.5 text-slate-400 transition-transform ${completedCollapsed ? "" : "rotate-90"}`}
              />
            </button>
            {!completedCollapsed && (
              <ul className="space-y-2">
                {completedItems.map((item) => (
                  <li
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setViewingItem(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setViewingItem(item);
                      }
                    }}
                    className="flex cursor-pointer items-center justify-between rounded border border-notion-hairline p-3 hover:bg-notion-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-notion-text">
                        {item.name}
                        <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">
                          ✓ Complete
                        </span>
                      </p>
                      <p className="text-sm text-slate-400">{formatCentavos(Math.abs(item.amount))}</p>
                    </div>
                    {/* Mirrors the active list's own confirm-delete pattern
                        below - this row has its own copy since it renders
                        outside that loop. */}
                    {confirmingDeleteId === item.id ? (
                      <div
                        className="flex shrink-0 items-center gap-2"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <span className="text-sm text-slate-600">Delete?</span>
                        <form action={deleteAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <SubmitButton className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                            Yes
                          </SubmitButton>
                        </form>
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(null)}
                          className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirmingDeleteId(item.id);
                        }}
                        className="shrink-0 rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {modalState !== null && (
          <MonthlyGoalModal
            item={modalState === "new" ? null : modalState}
            noun={noun}
            amountLabel={amountLabel}
            balances={balances}
            createAction={createAction}
            updateAction={updateAction}
            onClose={() => setModalState(null)}
          />
        )}

        {viewingItem && (
          <ItemTransactionsModal
            name={viewingItem.name}
            upcoming={upcomingByItemId.get(viewingItem.id) ?? []}
            paid={paidByItemId.get(viewingItem.id) ?? []}
            onClose={() => setViewingItem(null)}
          />
        )}
      </div>
    </div>
  );
}
