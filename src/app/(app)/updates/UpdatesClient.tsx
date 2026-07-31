"use client";

import { useEffect } from "react";
import { dayKeyManila, formatFullDate, formatTimeManila } from "@/lib/date";
import { CloseIcon } from "@/components/navIcons";
import { SubmitButton } from "@/components/SubmitButton";
import { dismissUpdate, markUpdatesSeen } from "./actions";
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
  misc: "misc item",
  reminder: "reminder",
};

// T163 ("what's changed since you last logged in", so a couple sharing one
// account can stay in sync): a plain reverse-chronological feed over T162's
// activity_log, grouped by calendar day the same way the Forecast groups
// rows by date (T161) - a familiar pattern rather than a new one.
export function UpdatesClient({ entries, seenAt }: { entries: ActivityLogRow[]; seenAt: string | null }) {
  useEffect(() => {
    // Fires once, after the page has actually rendered this feed - marks
    // everything visible here as seen for *next* time. Deliberately not
    // conditioned on `entries.length > 0`: opening an empty feed still
    // means "I looked," so a later entry inserted the same day shouldn't
    // retroactively count as unseen from before this visit.
    markUpdatesSeen();
  }, []);

  const groups: { day: string; rows: ActivityLogRow[] }[] = [];
  for (const entry of entries) {
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
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-notion-text">Updates</h1>
          <p className="text-slate-500">Every change made to this account, most recent first.</p>
        </div>

        {entries.length === 0 ? (
          <p className="text-slate-500">Nothing here yet - changes you make anywhere in Orium will show up here.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.day}>
                <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {formatFullDate(group.day)}
                </h2>
                <ul className="space-y-1.5">
                  {group.rows.map((entry) => {
                    const isNew = seenAt === null || entry.created_at > seenAt;
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
          </div>
        )}
      </div>
    </div>
  );
}
