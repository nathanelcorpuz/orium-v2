"use client";

import { useState } from "react";
import { formatCentavos } from "@/lib/money";
import { PreviewModeBar } from "@/components/PreviewModeBar";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteBalance } from "./actions";
import { BalanceModal, type BalanceRow } from "./BalanceModal";

// T71 (SPEC.md Phase 12): a bill/income/debt/savings/extra currently linked
// to an account, for the "connected items" view in that account's own edit
// modal.
export type ConnectedItem = {
  id: string;
  name: string;
  amount: number;
  balanceId: string;
  sourceType: "recurring" | "one_off";
  type: string;
};

export function BalancesClient({
  balances,
  connectedItems,
  // T120: `?preview=1` renders a read-only sample fixture (see page.tsx) -
  // every mutating control is hidden so a tour/preview session can never
  // write to (or 404 against) the real account behind it.
  previewMode = false,
}: {
  balances: BalanceRow[];
  connectedItems: ConnectedItem[];
  previewMode?: boolean;
}) {
  const [modalState, setModalState] = useState<null | "new" | BalanceRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const total = balances.reduce((sum, balance) => sum + balance.amount, 0);

  return (
    <>
      {previewMode && <PreviewModeBar />}
      <div className="p-8">
      <div className="mx-auto max-w-2xl">
        <div data-tour="accounts-header" className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">Accounts</h1>
            <p className="text-slate-500">Total: {formatCentavos(total)}</p>
          </div>
          {!previewMode && (
            <button
              type="button"
              onClick={() => setModalState("new")}
              className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
            >
              Add account
            </button>
          )}
        </div>

        {balances.length === 0 ? (
          <p className="text-slate-500">No accounts yet. Add your first account above.</p>
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
                  {previewMode ? null : confirmingDeleteId === balance.id ? (
                    <>
                      <span className="text-sm text-slate-600">Delete?</span>
                      <form action={deleteBalance}>
                        <input type="hidden" name="id" value={balance.id} />
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
                        onClick={() => setModalState(balance)}
                        className="rounded border border-notion-hairline px-3 py-1 text-sm text-notion-text hover:bg-notion-hover"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(balance.id)}
                        className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
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
            connectedItems={
              modalState === "new" ? [] : connectedItems.filter((item) => item.balanceId === modalState.id)
            }
            onClose={() => setModalState(null)}
          />
        )}
      </div>
      </div>
    </>
  );
}
