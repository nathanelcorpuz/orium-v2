"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { CheckIcon, CloseIcon, DeleteIcon, EditIcon } from "@/components/navIcons";
import { centavosToPesosString, formatCentavos } from "@/lib/money";
import { formatFullDate, todayInManila } from "@/lib/date";
import { deleteBudgetEntry, updateBudgetEntry, type BudgetActionState } from "./actions";
import type { BudgetEntryRow } from "./BudgetCard";

const initialState: BudgetActionState = { error: null };

// T75: lowered from T68's 20/20 (same IntersectionObserver pattern, just a
// smaller batch) now that entries live in their own modal instead of
// competing for space on the card itself.
const INITIAL_VISIBLE_ENTRIES = 15;
const ENTRIES_PER_BATCH = 15;

// One ledger entry (spend, manual add, or manual take - SPEC.md Phase 10).
// Its own component so each entry gets an independent useActionState/edit-
// mode instead of one shared across the whole list. Moved here from
// BudgetCard.tsx (T75) - entries only ever render inside this modal now.
function BudgetEntryListItem({
  entry,
  budgetId,
  budgetName,
}: {
  entry: BudgetEntryRow;
  budgetId: string;
  budgetName: string;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [editState, editFormAction, editPending] = useActionState(updateBudgetEntry, initialState);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !editPending && !editState.error) {
      setMode("view");
      submitted.current = false;
    }
  }, [editPending, editState]);

  if (mode === "edit") {
    return (
      <li>
        <form
          action={editFormAction}
          onSubmit={() => {
            submitted.current = true;
          }}
          className="flex flex-wrap items-end gap-2 py-1"
        >
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="budgetId" value={budgetId} />
          <input type="hidden" name="budgetName" value={budgetName} />
          <input
            name="amountPesos"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={centavosToPesosString(entry.amount)}
            aria-label="Amount"
            className="w-20 rounded border border-notion-hairline p-1 text-xs text-notion-text"
          />
          <input
            name="entryDate"
            type="date"
            required
            defaultValue={entry.entry_date}
            aria-label="Date"
            className="rounded border border-notion-hairline p-1 text-xs text-notion-text"
          />
          <input
            name="note"
            type="text"
            defaultValue={entry.note ?? ""}
            aria-label="Note"
            className="min-w-[6rem] flex-1 rounded border border-notion-hairline p-1 text-xs text-notion-text"
          />
          <button
            type="submit"
            disabled={editPending}
            title="Save"
            aria-label="Save"
            className="shrink-0 rounded p-1 text-notion-accent hover:bg-notion-hover disabled:opacity-50"
          >
            <CheckIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMode("view")}
            title="Cancel"
            aria-label="Cancel"
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </form>
        {editState.error && <p className="text-xs text-red-600">{editState.error}</p>}
      </li>
    );
  }

  if (mode === "delete") {
    return (
      <li className="flex items-center justify-between gap-2 text-sm">
        <span className="text-slate-600">Delete this entry?</span>
        <span className="flex items-center gap-1">
          <form action={deleteBudgetEntry}>
            <input type="hidden" name="id" value={entry.id} />
            <button
              type="submit"
              title="Confirm delete"
              aria-label="Confirm delete"
              className="rounded p-1 text-red-600 hover:bg-red-50"
            >
              <CheckIcon className="h-3.5 w-3.5" />
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMode("view")}
            title="Cancel"
            aria-label="Cancel"
            className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      </li>
    );
  }

  const isIncoming = entry.direction === "incoming";
  return (
    <li className="flex items-center justify-between gap-2 text-sm text-notion-text">
      <span className="truncate">
        {formatFullDate(entry.entry_date)}
        {entry.note && ` - ${entry.note}`}
      </span>
      <span className="flex items-center gap-2">
        <span className={isIncoming ? "text-green-700" : "text-slate-600"}>
          {isIncoming ? "+" : "-"}
          {formatCentavos(entry.amount)}
        </span>
        <button
          type="button"
          onClick={() => setMode("edit")}
          title="Edit entry"
          aria-label={`Edit entry ${entry.entry_date}`}
          className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
        >
          <EditIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setMode("delete")}
          title="Delete entry"
          aria-label={`Delete entry ${entry.entry_date}`}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <DeleteIcon className="h-3.5 w-3.5" />
        </button>
      </span>
    </li>
  );
}

// T75: the entries list pulled out of BudgetCard.tsx's always-inline layout
// into its own modal, opened from the card's button row. Point 1 of the
// task's three asks (gray contained box for the list) is the modal body
// itself here, not a nested box within it - the modal shell already reads as
// its own region, so wrapping the list in a second gray box inside it would
// be redundant framing.
export function BudgetEntriesModal({
  budgetId,
  budgetName,
  entries,
  onClose,
}: {
  budgetId: string;
  budgetName: string;
  entries: BudgetEntryRow[];
  onClose: () => void;
}) {
  const [monthFilter, setMonthFilter] = useState(""); // "" = all time
  const today = todayInManila();

  const filteredEntries = entries
    .filter((entry) => entry.entry_date <= today)
    .filter((entry) => (monthFilter ? entry.entry_date.startsWith(monthFilter) : true))
    .sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));

  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ENTRIES);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);

  // Reset to the first batch whenever the month filter changes, so a newly
  // selected month always starts fresh - same render-time state-adjustment
  // pattern ForecastClient.tsx (T50) and the pre-T75 BudgetCard.tsx used.
  const [prevMonthFilter, setPrevMonthFilter] = useState(monthFilter);
  if (monthFilter !== prevMonthFilter) {
    setPrevMonthFilter(monthFilter);
    setVisibleCount(INITIAL_VISIBLE_ENTRIES);
  }

  const visibleEntries = filteredEntries.slice(0, visibleCount);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => Math.min(count + ENTRIES_PER_BATCH, filteredEntries.length));
        }
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredEntries.length]);

  return (
    <Modal title={`${budgetName} — Entries`} onClose={onClose}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Filter by month</p>
        <input
          type="month"
          value={monthFilter}
          onChange={(event) => setMonthFilter(event.target.value)}
          aria-label={`Filter ${budgetName} entries by month`}
          className="rounded border border-notion-hairline p-1 text-xs text-notion-text"
        />
      </div>

      {filteredEntries.length > 0 ? (
        <div ref={scrollRef} className="max-h-72 overflow-y-auto rounded bg-slate-50 p-2">
          <ul className="space-y-1">
            {visibleEntries.map((entry) => (
              <BudgetEntryListItem key={entry.id} entry={entry} budgetId={budgetId} budgetName={budgetName} />
            ))}
            {visibleCount < filteredEntries.length && (
              <li ref={sentinelRef} className="py-1 text-center text-xs text-slate-400">
                Loading more…
              </li>
            )}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-400">No entries{monthFilter ? " that month" : " yet"}.</p>
      )}
    </Modal>
  );
}
