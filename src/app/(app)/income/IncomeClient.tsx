"use client";

import { useMemo, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { startDateLabel, summarizeRecurrence } from "@/lib/recurrenceSummary";
import { DatePicker } from "@/components/DatePicker";
import { AmountRangeFilter, matchesAmountFilter, type ComparisonOp } from "@/components/AmountRangeFilter";
import { accountFilterOptions, matchesAccountFilter } from "@/lib/accountFilter";
import { AmountSortControl, sortByAmount, type SortOrder } from "@/components/AmountSortControl";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import { ReorderButtons } from "@/components/ReorderButtons";
import { SubmitButton } from "@/components/SubmitButton";
import { ActiveToggle } from "@/components/ActiveToggle";
import type { RecurrenceUnit } from "@/lib/engine/types";
import { useOrderedList } from "@/lib/useOrderedList";
import { deleteIncome } from "./actions";
import { IncomeModal, type BalanceOption, type IncomeRow } from "./IncomeModal";

const UNIT_OPTIONS: { value: RecurrenceUnit; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

function incomeRule(income: IncomeRow) {
  return {
    startDate: income.start_date,
    interval: income.interval,
    unit: income.unit,
    weekdays: income.weekdays,
    daysOfMonth: income.days_of_month,
    ordinal: income.ordinal,
    ordinalWeekday: income.ordinal_weekday,
    endsType: income.ends_type,
    endDate: income.end_date,
    occurrenceCount: income.occurrence_count,
  };
}

// T71 follow-up: a budget replenished from a given income, for display next
// to that income's row.
type LinkedBudget = { id: string; name: string; linked_income_id: string | null };

export function IncomeClient({
  incomes,
  editedIds,
  balances,
  linkedBudgets,
}: {
  incomes: IncomeRow[];
  editedIds: Set<string>;
  balances: BalanceOption[];
  linkedBudgets: LinkedBudget[];
}) {
  const [modalState, setModalState] = useState<null | "new" | IncomeRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // T52: Income filter bar (name, amount range, recurrence unit) - mirrors
  // Bills' filter bar exactly, reusing the same shared components.
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

  // T145: persisted custom row order (up/down buttons) - only meaningful
  // as the base ordering when nothing else is already imposing one.
  const { orderedItems: orderedIncomes, moveUp, moveDown } = useOrderedList(
    "orium.incomeOrder",
    incomes,
    (income) => income.id,
  );
  const canReorder = sortOrder === "none" && !filtersActive;

  // T71 follow-up: connected account name, and budget names replenished from
  // each income, for display on each row.
  const balanceNameById = useMemo(() => new Map(balances.map((b) => [b.id, b.name])), [balances]);
  const budgetNamesByIncomeId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const budget of linkedBudgets) {
      if (!budget.linked_income_id) continue;
      const list = map.get(budget.linked_income_id) ?? [];
      list.push(budget.name);
      map.set(budget.linked_income_id, list);
    }
    return map;
  }, [linkedBudgets]);

  const filteredIncomes = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    return orderedIncomes.filter((income) => {
      if (name && !income.name.toLowerCase().includes(name)) return false;
      if (selectedUnits.size > 0 && !selectedUnits.has(income.unit)) return false;
      if (dateFrom && income.start_date < dateFrom) return false;
      if (dateTo && income.start_date > dateTo) return false;
      if (!matchesAmountFilter(income.amount, amountOp, amountValue1, amountValue2)) return false;
      if (!matchesAccountFilter(income.balance_id, selectedAccounts)) return false;
      return true;
    });
  }, [
    orderedIncomes,
    nameFilter,
    selectedUnits,
    dateFrom,
    dateTo,
    amountOp,
    amountValue1,
    amountValue2,
    selectedAccounts,
  ]);

  const sortedIncomes = useMemo(
    () => sortByAmount(filteredIncomes, sortOrder, (income) => income.amount),
    [filteredIncomes, sortOrder],
  );

  // Goes through incomeRule (not the raw row) because IncomeRow's
  // days_of_month is snake_case - monthlyEquivalent's optional daysOfMonth
  // field would silently miss it otherwise (no compile error, just a
  // wrong total, since the mismatch is on an optional property). Always over
  // the full unfiltered list - filters narrow what's displayed, not what
  // counts toward the page's own total.
  const totalMonthly = incomes.reduce(
    (sum, income) => sum + monthlyEquivalent({ ...incomeRule(income), amount: income.amount }),
    0,
  );

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <div data-tour="income-header" className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">Income</h1>
            <p className="text-slate-500">
              Total monthly (est.): <span className="text-green-700">{formatCentavos(totalMonthly)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
          >
            Add income
          </button>
        </div>

        {incomes.length > 0 && (
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
                Showing {filteredIncomes.length} of {incomes.length} income sources
              </p>
            )}
          </div>
        )}

        {incomes.length === 0 ? (
          <p className="text-slate-500">No income sources yet. Add your first one above.</p>
        ) : sortedIncomes.length === 0 ? (
          <p className="text-slate-500">No income sources match these filters.</p>
        ) : (
          <ul className="space-y-2">
            {sortedIncomes.map((income, index) => {
              const funds = budgetNamesByIncomeId.get(income.id);
              return (
              <li
                key={income.id}
                className={`flex items-center justify-between rounded-lg border border-notion-hairline bg-white p-4 ${income.active === false ? "opacity-60" : ""}`}
              >
                {canReorder && (
                  <ReorderButtons
                    onMoveUp={() => moveUp(income.id)}
                    onMoveDown={() => moveDown(income.id)}
                    isFirst={index === 0}
                    isLast={index === sortedIncomes.length - 1}
                  />
                )}
                <div className="min-w-0 flex-1">
                  {/* T71 follow-up: connected account + linked budgets moved
                      from a run-on text line into pill badges next to the
                      name (matching the Budgets page's "Connected to
                      {income}" pill) - each reads as its own clear chunk
                      instead of blending into the recurrence sentence. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium text-notion-text">
                      {income.name}
                      {income.active === false && (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                          Off
                        </span>
                      )}
                      {editedIds.has(income.id) && (
                        <span className="ml-1.5 text-slate-400" title="Edited from its usual schedule">
                          ✎
                        </span>
                      )}
                    </p>
                    {income.balance_id && (
                      <span className="rounded-full bg-notion-hover px-2 py-0.5 text-xs font-medium text-slate-500">
                        {balanceNameById.get(income.balance_id) ?? "-"}
                      </span>
                    )}
                    {funds && funds.length > 0 && (
                      <span
                        className="rounded-full bg-notion-hover px-2 py-0.5 text-xs font-medium text-slate-500"
                        title="Budgets funded from this income"
                      >
                        Funds: {funds.join(", ")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-green-700">{formatCentavos(income.amount)}</p>
                  <p className="text-sm text-slate-400">
                    {startDateLabel(incomeRule(income))} · {summarizeRecurrence(incomeRule(income))}
                  </p>
                  {income.comments && (
                    <p className="mt-1 text-sm italic text-slate-400">{income.comments}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {confirmingDeleteId === income.id ? (
                    <>
                      <span className="text-sm text-slate-600">Delete?</span>
                      <form action={deleteIncome}>
                        <input type="hidden" name="id" value={income.id} />
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
                        onClick={() => setModalState(income)}
                        className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                      >
                        Edit
                      </button>
                      <ActiveToggle kind="recurring" id={income.id} active={income.active !== false} />
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(income.id)}
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

        {modalState !== null && (
          <IncomeModal
            income={modalState === "new" ? null : modalState}
            balances={balances}
            onClose={() => setModalState(null)}
          />
        )}
      </div>
    </div>
  );
}
