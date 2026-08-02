"use client";

import { useMemo, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { formatFullDate, todayInManila } from "@/lib/date";
import { DatePicker } from "@/components/DatePicker";
import { AmountRangeFilter, matchesAmountFilter, type ComparisonOp } from "@/components/AmountRangeFilter";
import { matchesAccountFilter } from "@/lib/accountFilter";
import { AccountFilterDropdown } from "@/components/AccountFilterDropdown";
import { AmountSortControl, sortByAmount, type SortOrder } from "@/components/AmountSortControl";
import { CollapsibleFilters } from "@/components/CollapsibleFilters";
import { ReorderButtons } from "@/components/ReorderButtons";
import { RowIconActions } from "@/components/RowIconActions";
import { SubmitButton } from "@/components/SubmitButton";
import { ActiveToggle } from "@/components/ActiveToggle";
import { useOrderedList } from "@/lib/useOrderedList";
import { deleteExtra } from "./actions";
import { ExtraModal, type BalanceOption, type ExtraRow } from "./ExtraModal";

export function ExtraClient({ extras, balances }: { extras: ExtraRow[]; balances: BalanceOption[] }) {
  const [modalState, setModalState] = useState<null | "new" | ExtraRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // T52: Extras filter bar - name, amount range, and due-date range (a
  // one-off has a due date rather than a recurrence, so this stands in for
  // the recurrence-unit filter the four recurring-item pages use).
  const [nameFilter, setNameFilter] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
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

  function clearFilters() {
    setNameFilter("");
    setDueFrom("");
    setDueTo("");
    setAmountOp("any");
    setAmountValue1("");
    setAmountValue2("");
    setSelectedAccounts(new Set());
  }

  // T231: a count rather than a plain boolean, so the mobile "Filters"
  // button can badge how many are actually narrowing the list.
  const activeFilterCount =
    (nameFilter !== "" ? 1 : 0) +
    (dueFrom !== "" ? 1 : 0) +
    (dueTo !== "" ? 1 : 0) +
    (amountOp !== "any" ? 1 : 0) +
    (selectedAccounts.size > 0 ? 1 : 0);
  const filtersActive = activeFilterCount > 0;

  // T145: persisted custom row order (up/down buttons) - only meaningful
  // as the base ordering when nothing else is already imposing one.
  const { orderedItems: orderedExtras, moveUp, moveDown } = useOrderedList(
    "orium.miscOrder",
    extras,
    (extra) => extra.id,
  );
  const canReorder = sortOrder === "none" && !filtersActive;

  const filteredExtras = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    return orderedExtras.filter((extra) => {
      if (name && !extra.name.toLowerCase().includes(name)) return false;
      if (dueFrom && extra.due_date < dueFrom) return false;
      if (dueTo && extra.due_date > dueTo) return false;
      if (!matchesAmountFilter(extra.amount, amountOp, amountValue1, amountValue2)) return false;
      if (!matchesAccountFilter(extra.balance_id, selectedAccounts)) return false;
      return true;
    });
  }, [orderedExtras, nameFilter, dueFrom, dueTo, amountOp, amountValue1, amountValue2, selectedAccounts]);

  const sortedExtras = useMemo(
    () => sortByAmount(filteredExtras, sortOrder, (extra) => extra.amount),
    [filteredExtras, sortOrder],
  );

  // T71 follow-up: shows the connected account's name (if any) on each row.
  const balanceNameById = useMemo(() => new Map(balances.map((b) => [b.id, b.name])), [balances]);

  const today = todayInManila();
  // Always over the full unfiltered list - filters narrow what's displayed,
  // not what counts toward the page's own total.
  const totalRemaining = extras
    .filter((extra) => extra.due_date >= today)
    .reduce((sum, extra) => sum + extra.amount, 0);

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <div data-tour="misc-header" className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">Misc</h1>
            <p className="text-slate-500">
              Total remaining: <span className="text-purple-700">{formatCentavos(totalRemaining)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="shrink-0 rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
          >
            Add misc item
          </button>
        </div>

        {extras.length > 0 && (
          <CollapsibleFilters activeCount={activeFilterCount}>
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
                <label className="text-xs text-slate-500">Due from</label>
                <DatePicker
                  value={dueFrom}
                  onChange={setDueFrom}
                  className="rounded border border-notion-hairline px-1.5 py-1 text-left text-xs focus:border-notion-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Due to</label>
                <DatePicker
                  value={dueTo}
                  onChange={setDueTo}
                  className="rounded border border-notion-hairline px-1.5 py-1 text-left text-xs focus:border-notion-accent focus:outline-none"
                />
              </div>
              {balances.length > 0 && (
                <AccountFilterDropdown balances={balances} selected={selectedAccounts} onToggle={toggleAccount} />
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
                Showing {filteredExtras.length} of {extras.length} misc items
              </p>
            )}
          </CollapsibleFilters>
        )}

        {extras.length === 0 ? (
          <p className="text-slate-500">No misc items yet. Add your first one above.</p>
        ) : sortedExtras.length === 0 ? (
          <p className="text-slate-500">No misc items match these filters.</p>
        ) : (
          <ul className="space-y-2">
            {sortedExtras.map((extra, index) => (
              <li
                key={extra.id}
                /* T231: below `sm` the actions drop to their own line
                   instead of competing with the name/amount for a 375px
                   row - same shape the Accounts page already uses (T189). */
                className={`flex flex-col gap-3 rounded-lg border border-notion-hairline bg-white p-4 sm:flex-row sm:items-center sm:justify-between ${extra.active === false ? "opacity-50 grayscale" : ""}`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                {canReorder && (
                  <ReorderButtons
                    onMoveUp={() => moveUp(extra.id)}
                    onMoveDown={() => moveDown(extra.id)}
                    isFirst={index === 0}
                    isLast={index === sortedExtras.length - 1}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium text-notion-text">{extra.name}</p>
                    {extra.active === false && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                        Off
                      </span>
                    )}
                    {extra.balance_id && (
                      <span className="rounded-full bg-notion-hover px-2 py-0.5 text-xs font-medium text-slate-500">
                        {balanceNameById.get(extra.balance_id) ?? "-"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-purple-700">
                    {formatCentavos(extra.amount)}, due {formatFullDate(extra.due_date)}
                  </p>
                  {extra.comments && (
                    <p className="mt-1 text-sm italic text-slate-400">{extra.comments}</p>
                  )}
                </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {confirmingDeleteId === extra.id ? (
                    <>
                      <span className="text-sm text-slate-600">Delete?</span>
                      <form action={deleteExtra}>
                        <input type="hidden" name="id" value={extra.id} />
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
                      <ActiveToggle kind="one_off" id={extra.id} active={extra.active !== false} />
                      <RowIconActions
                        onEdit={() => setModalState(extra)}
                        onDelete={() => setConfirmingDeleteId(extra.id)}
                      />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {modalState !== null && (
          <ExtraModal
            extra={modalState === "new" ? null : modalState}
            balances={balances}
            onClose={() => setModalState(null)}
          />
        )}
      </div>
    </div>
  );
}
