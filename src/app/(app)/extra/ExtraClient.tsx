"use client";

import { useMemo, useState } from "react";
import { formatCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { AmountRangeFilter, matchesAmountFilter, type ComparisonOp } from "@/components/AmountRangeFilter";
import { deleteExtra } from "./actions";
import { ExtraModal, type ExtraRow } from "./ExtraModal";

export function ExtraClient({ extras }: { extras: ExtraRow[] }) {
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

  function clearFilters() {
    setNameFilter("");
    setDueFrom("");
    setDueTo("");
    setAmountOp("any");
    setAmountValue1("");
    setAmountValue2("");
  }

  const filtersActive =
    nameFilter !== "" || dueFrom !== "" || dueTo !== "" || amountOp !== "any";

  const filteredExtras = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    return extras.filter((extra) => {
      if (name && !extra.name.toLowerCase().includes(name)) return false;
      if (dueFrom && extra.due_date < dueFrom) return false;
      if (dueTo && extra.due_date > dueTo) return false;
      if (!matchesAmountFilter(extra.amount, amountOp, amountValue1, amountValue2)) return false;
      return true;
    });
  }, [extras, nameFilter, dueFrom, dueTo, amountOp, amountValue1, amountValue2]);

  const today = todayInManila();
  // Always over the full unfiltered list - filters narrow what's displayed,
  // not what counts toward the page's own total.
  const totalRemaining = extras
    .filter((extra) => extra.due_date >= today)
    .reduce((sum, extra) => sum + extra.amount, 0);

  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">Extras</h1>
            <p className="text-slate-500">
              Total remaining: <span className="text-purple-700">{formatCentavos(totalRemaining)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
          >
            Add extra
          </button>
        </div>

        {extras.length > 0 && (
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
                <label className="text-xs text-slate-500">Due from</label>
                <input
                  type="date"
                  value={dueFrom}
                  onChange={(event) => setDueFrom(event.target.value)}
                  className="rounded border border-notion-hairline px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Due to</label>
                <input
                  type="date"
                  value={dueTo}
                  onChange={(event) => setDueTo(event.target.value)}
                  className="rounded border border-notion-hairline px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
                />
              </div>
              <AmountRangeFilter
                label="Amount"
                op={amountOp}
                value1={amountValue1}
                value2={amountValue2}
                onOpChange={setAmountOp}
                onValue1Change={setAmountValue1}
                onValue2Change={setAmountValue2}
              />
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
                Showing {filteredExtras.length} of {extras.length} extras
              </p>
            )}
          </div>
        )}

        {extras.length === 0 ? (
          <p className="text-slate-500">No extras yet. Add your first one above.</p>
        ) : filteredExtras.length === 0 ? (
          <p className="text-slate-500">No extras match these filters.</p>
        ) : (
          <ul className="space-y-2">
            {filteredExtras.map((extra) => (
              <li
                key={extra.id}
                className="flex items-center justify-between rounded-lg border border-notion-hairline bg-white p-4"
              >
                <div>
                  <p className="font-medium text-notion-text">{extra.name}</p>
                  <p className="text-sm text-purple-700">
                    {formatCentavos(extra.amount)}, due {extra.due_date}
                  </p>
                  {extra.comments && (
                    <p className="text-sm text-slate-400">{extra.comments}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {confirmingDeleteId === extra.id ? (
                    <>
                      <span className="text-sm text-slate-600">Delete?</span>
                      <form action={deleteExtra}>
                        <input type="hidden" name="id" value={extra.id} />
                        <button
                          type="submit"
                          className="rounded border border-red-300 px-3 py-1 text-sm text-red-600"
                        >
                          Yes
                        </button>
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
                        onClick={() => setModalState(extra)}
                        className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(extra.id)}
                        className="rounded border border-red-300 px-3 py-1 text-sm text-red-600"
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

        {modalState !== null && (
          <ExtraModal
            extra={modalState === "new" ? null : modalState}
            onClose={() => setModalState(null)}
          />
        )}
      </div>
    </div>
  );
}
