"use client";

import { useState } from "react";
import Link from "next/link";
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
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm text-slate-500 underline">
          &larr; Home
        </Link>

        <div className="mb-6 mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Extras</h1>
            <p className="text-slate-600">
              Total remaining: <span className="text-purple-700">{formatCentavos(totalRemaining)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-slate-900 px-4 py-2 text-white"
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
                className="flex items-center justify-between rounded-xl bg-white p-4 shadow"
              >
                <div>
                  <p className="font-medium">{extra.name}</p>
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
                        className="rounded border border-slate-300 px-3 py-1 text-sm"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setModalState(extra)}
                        className="rounded border border-slate-300 px-3 py-1 text-sm"
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
    </main>
  );
}
