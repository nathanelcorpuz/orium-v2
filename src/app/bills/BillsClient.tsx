"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCentavos } from "@/lib/money";
import { deleteBill } from "./actions";
import { BillModal, type BillRow } from "./BillModal";

export function BillsClient({ bills }: { bills: BillRow[] }) {
  const [modalState, setModalState] = useState<null | "new" | BillRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const totalMonthly = bills.reduce((sum, bill) => sum + Math.abs(bill.amount), 0);

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm text-slate-500 underline">
          &larr; Home
        </Link>

        <div className="mb-6 mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Bills</h1>
            <p className="text-slate-600">Total monthly: {formatCentavos(totalMonthly)}</p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-slate-900 px-4 py-2 text-white"
          >
            Add bill
          </button>
        </div>

        {bills.length === 0 ? (
          <p className="text-slate-500">No bills yet. Add your first bill above.</p>
        ) : (
          <ul className="space-y-2">
            {bills.map((bill) => (
              <li
                key={bill.id}
                className="flex items-center justify-between rounded-xl bg-white p-4 shadow"
              >
                <div>
                  <p className="font-medium">{bill.name}</p>
                  <p className="text-sm text-slate-600">
                    {formatCentavos(Math.abs(bill.amount))} / month, due on day {bill.day_of_month}
                  </p>
                  <p className="text-sm text-slate-400">Tracked until {bill.end_date}</p>
                  {bill.comments && <p className="text-sm text-slate-400">{bill.comments}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {confirmingDeleteId === bill.id ? (
                    <>
                      <span className="text-sm text-slate-600">Delete?</span>
                      <form action={deleteBill}>
                        <input type="hidden" name="id" value={bill.id} />
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
                        onClick={() => setModalState(bill)}
                        className="rounded border border-slate-300 px-3 py-1 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(bill.id)}
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
          <BillModal
            bill={modalState === "new" ? null : modalState}
            onClose={() => setModalState(null)}
          />
        )}
      </div>
    </main>
  );
}
