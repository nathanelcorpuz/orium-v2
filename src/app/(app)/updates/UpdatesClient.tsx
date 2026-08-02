"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dayKeyManila, formatFullDate, formatTimeManila } from "@/lib/date";
import { CheckIcon, CloseIcon } from "@/components/navIcons";
import { SubmitButton } from "@/components/SubmitButton";
import { DatePicker } from "@/components/DatePicker";
import { CollapsibleFilters } from "@/components/CollapsibleFilters";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import { dismissUpdate, markUpdateRead, markUpdatesSeen } from "./actions";
import type { ActivityLogRow } from "./page";

const ACTION_VERB: Record<string, string> = {
  create: "Added",
  update: "Updated",
  delete: "Deleted",
  settle: "Settled",
  toggle_on: "Switched on",
  toggle_off: "Switched off",
};

const ENTITY_LABEL: Record<string, string> = {
  account: "account",
  bill: "bill",
  income: "income",
  debt: "debt",
  savings: "savings goal",
  budget: "budget",
  budget_entry: "budget entry",
  budget_account: "budget account",
  misc: "misc item",
  reminder: "reminder",
};

const ENTITY_TYPE_OPTIONS = Object.entries(ENTITY_LABEL).map(([value, label]) => ({ value, label }));

// T187: same client-side batching Forecast uses (T49) - the feed is already
// capped server-side (FEED_LIMIT, page.tsx), so this is purely incremental
// *rendering* of an already-fetched array, not new pagination plumbing.
const INITIAL_VISIBLE_ROWS = 50;
const ROWS_PER_BATCH = 50;

// T163 ("what's changed since you last logged in"), reworked by T187: an
// entry now stays "new" until the user explicitly marks it read - either
// individually or via "Mark all as read" - rather than the whole feed
// silently marking itself seen the moment the page opened. Still grouped by
// calendar day (T161's Forecast grouping).
export function UpdatesClient({
  entries,
  seenAt,
  readIds,
}: {
  entries: ActivityLogRow[];
  seenAt: string | null;
  readIds: Set<string>;
}) {
  const [nameFilter, setNameFilter] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function clearFilters() {
    setNameFilter("");
    setSelectedTypes(new Set());
    setDateFrom("");
    setDateTo("");
  }

  // T231: a count rather than a plain boolean, so the mobile "Filters"
  // button can badge how many are actually narrowing the list.
  const activeFilterCount =
    (nameFilter !== "" ? 1 : 0) +
    (selectedTypes.size > 0 ? 1 : 0) +
    (dateFrom !== "" ? 1 : 0) +
    (dateTo !== "" ? 1 : 0);
  const filtersActive = activeFilterCount > 0;

  const filteredEntries = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    return entries.filter((entry) => {
      if (
        name &&
        !entry.entity_name.toLowerCase().includes(name) &&
        !(entry.detail ?? "").toLowerCase().includes(name)
      ) {
        return false;
      }
      if (selectedTypes.size > 0 && !selectedTypes.has(entry.entity_type)) return false;
      const day = dayKeyManila(entry.created_at);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [entries, nameFilter, selectedTypes, dateFrom, dateTo]);

  function isUnread(entry: ActivityLogRow) {
    return (seenAt === null || entry.created_at > seenAt) && !readIds.has(entry.id);
  }
  const hasUnread = useMemo(
    () => entries.some((entry) => (seenAt === null || entry.created_at > seenAt) && !readIds.has(entry.id)),
    [entries, seenAt, readIds],
  );

  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Same render-phase reset Forecast uses (T49) rather than an effect, so a
  // filter change doesn't leave a stale, too-short visible window.
  const filterKey = `${nameFilter}|${[...selectedTypes].sort().join(",")}|${dateFrom}|${dateTo}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(INITIAL_VISIBLE_ROWS);
  }

  const visibleEntries = filteredEntries.slice(0, visibleCount);

  // Updates is a plain full-page scroll (no inner scrollable container the
  // way Forecast's sidebar-constrained layout has), so the observer's root
  // is left as the default - the browser viewport - rather than passed a
  // ref to a div that would never actually clip/scroll its own content.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => Math.min(count + ROWS_PER_BATCH, filteredEntries.length));
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredEntries.length]);

  const groups: { day: string; rows: ActivityLogRow[] }[] = [];
  for (const entry of visibleEntries) {
    const day = dayKeyManila(entry.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.rows.push(entry);
    } else {
      groups.push({ day, rows: [entry] });
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">Updates</h1>
            <p className="text-slate-500">Every change made to this account, most recent first.</p>
          </div>
          {hasUnread && (
            <form action={markUpdatesSeen} className="shrink-0">
              <SubmitButton className="rounded border border-notion-hairline px-3 py-1.5 text-sm text-notion-text hover:bg-notion-hover disabled:opacity-50">
                Mark all as read
              </SubmitButton>
            </form>
          )}
        </div>

        {entries.length > 0 && (
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
                <label className="text-xs text-slate-500">Type</label>
                <MultiSelectChips options={ENTITY_TYPE_OPTIONS} selected={selectedTypes} onToggle={toggleType} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Date from</label>
                <DatePicker
                  value={dateFrom}
                  onChange={setDateFrom}
                  className="rounded border border-notion-hairline px-1.5 py-1 text-left text-xs focus:border-notion-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Date to</label>
                <DatePicker
                  value={dateTo}
                  onChange={setDateTo}
                  className="rounded border border-notion-hairline px-1.5 py-1 text-left text-xs focus:border-notion-accent focus:outline-none"
                />
              </div>
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
                Showing {filteredEntries.length} of {entries.length} updates
              </p>
            )}
          </CollapsibleFilters>
        )}

        {entries.length === 0 ? (
          <p className="text-slate-500">Nothing here yet - changes you make anywhere in Orium will show up here.</p>
        ) : filteredEntries.length === 0 ? (
          <p className="text-slate-500">No updates match these filters.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.day}>
                <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {formatFullDate(group.day)}
                </h2>
                <ul className="space-y-1.5">
                  {group.rows.map((entry) => {
                    const isNew = isUnread(entry);
                    return (
                      <li
                        key={entry.id}
                        className={`rounded-lg border p-3 ${
                          isNew ? "border-notion-accent/30 bg-notion-accent/5" : "border-notion-hairline bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-notion-text">
                            {isNew && (
                              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-notion-accent align-middle" />
                            )}
                            <span className="font-medium">{ACTION_VERB[entry.action] ?? entry.action}</span>{" "}
                            {ENTITY_LABEL[entry.entity_type] ?? entry.entity_type}:{" "}
                            <span className="font-medium">{entry.entity_name}</span>
                          </p>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="text-xs text-slate-400">{formatTimeManila(entry.created_at)}</span>
                            {/* T187: marks just this one entry read, leaving the
                                rest of the feed exactly as unread as it was. */}
                            {isNew && (
                              <form action={markUpdateRead}>
                                <input type="hidden" name="id" value={entry.id} />
                                <SubmitButton
                                  title="Mark as read"
                                  aria-label="Mark as read"
                                  className="rounded p-0.5 text-slate-300 hover:bg-notion-hover hover:text-slate-500 disabled:opacity-50"
                                  spinnerClassName="h-3 w-3"
                                >
                                  <CheckIcon className="h-3.5 w-3.5" />
                                </SubmitButton>
                              </form>
                            )}
                            {/* T185: hides this entry from the user's own view only -
                                the underlying activity_log row is never touched (that
                                table is append-only, even to its owner, so the real
                                record survives for bug-hunting). */}
                            <form action={dismissUpdate}>
                              <input type="hidden" name="id" value={entry.id} />
                              <SubmitButton
                                title="Hide this update"
                                aria-label="Hide this update"
                                className="rounded p-0.5 text-slate-300 hover:bg-notion-hover hover:text-slate-500 disabled:opacity-50"
                                spinnerClassName="h-3 w-3"
                              >
                                <CloseIcon className="h-3.5 w-3.5" />
                              </SubmitButton>
                            </form>
                          </div>
                        </div>
                        {entry.detail && <p className="mt-0.5 text-sm text-slate-500">{entry.detail}</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {visibleCount < filteredEntries.length && (
              <div ref={sentinelRef} className="p-2 text-center text-xs text-slate-400">
                Loading more…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
