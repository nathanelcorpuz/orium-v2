"use client";

import { useState } from "react";
import { formatCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { deleteExtra } from "./actions";
import { ExtraModal, type ExtraRow } from "./ExtraModal";

export function ExtraClient({ extras }: { extras: ExtraRow[] }) {
  const [modalState, setModalState] = useState<null | "new" | ExtraRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const today = todayInManila();
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

        {extras.length === 0 ? (
          <p className="text-slate-500">No extras yet. Add your first one above.</p>
        ) : (
          <ul className="space-y-2">
            {extras.map((extra) => (
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
