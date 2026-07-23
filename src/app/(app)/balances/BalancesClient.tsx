"use client";

import { useState } from "react";
import { formatCentavos } from "@/lib/money";
import { deleteBalance } from "./actions";
import { BalanceModal, type BalanceRow } from "./BalanceModal";

export function BalancesClient({ balances }: { balances: BalanceRow[] }) {
  const [modalState, setModalState] = useState<null | "new" | BalanceRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const total = balances.reduce((sum, balance) => sum + balance.amount, 0);

  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">Balances</h1>
            <p className="text-slate-500">Total: {formatCentavos(total)}</p>
          </div>
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
          >
            Add balance
          </button>
        </div>

        {balances.length === 0 ? (
          <p className="text-slate-500">No balances yet. Add your first account above.</p>
        ) : (
          <ul className="space-y-2">
            {balances.map((balance) => (
              <li
                key={balance.id}
                className="flex items-center justify-between rounded-lg border border-notion-hairline bg-white p-4"
              >
                <div>
                  <p className="font-medium text-notion-text">{balance.name}</p>
                  <p className="text-sm text-slate-600">{formatCentavos(balance.amount)}</p>
                  {balance.comments && (
                    <p className="text-sm text-slate-400">{balance.comments}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {confirmingDeleteId === balance.id ? (
                    <>
                      <span className="text-sm text-slate-600">Delete?</span>
                      <form action={deleteBalance}>
                        <input type="hidden" name="id" value={balance.id} />
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
                        onClick={() => setModalState(balance)}
                        className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(balance.id)}
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
          <BalanceModal
            balance={modalState === "new" ? null : modalState}
            onClose={() => setModalState(null)}
          />
        )}
      </div>
    </div>
  );
}
