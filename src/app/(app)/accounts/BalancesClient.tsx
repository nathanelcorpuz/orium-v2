"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCentavos } from "@/lib/money";
import { formatFullDate, todayInManila } from "@/lib/date";
import { PreviewModeBar } from "@/components/PreviewModeBar";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteIcon, EditIcon, HistoryIcon } from "@/components/navIcons";
import type { AccountLowestPoint } from "@/lib/engine/accountBalances";
import { deleteBalance } from "./actions";
import { BalanceModal, type BalanceRow } from "./BalanceModal";
import { AccountFundsModal } from "./AccountFundsModal";
import { AccountHistoryModal, type BalanceTransactionRow } from "./AccountHistoryModal";
import type { ConnectedItem } from "@/lib/connectedItems";

// T152: `ConnectedItem` moved to `@/lib/connectedItems` so the Forecast page
// can build the same data (see Bug #12). Re-exported here because this is
// where every existing import points, and a type-only re-export is erased at
// compile time - no server code reaches the client bundle through it.
export type { ConnectedItem };

export function BalancesClient({
  balances,
  connectedItems,
  // T186 follow-up: each account's own Add/Take/Move funds history, for the
  // new "History" button below - defaults to empty for preview mode, which
  // has no real transactions to show.
  transactionsByBalanceId = new Map(),
  // T180 follow-up: the same per-account "lowest projected balance" stat
  // Forecast's hover tooltip already showed, surfaced directly and visibly
  // here instead - defaults to empty for preview mode.
  lowestPointByBalanceId = new Map(),
  // T212: which income auto-moves land in this account, keyed by
  // destination balance id - defaults to empty for preview mode, same as
  // every other real-data map on this page.
  autoMovesByDestination = new Map(),
  currency = "₱",
  today = todayInManila(),
  // T120: `?preview=1` renders a read-only sample fixture (see page.tsx) -
  // every mutating control is hidden so a tour/preview session can never
  // write to (or 404 against) the real account behind it.
  previewMode = false,
}: {
  balances: BalanceRow[];
  connectedItems: ConnectedItem[];
  transactionsByBalanceId?: Map<string, BalanceTransactionRow[]>;
  lowestPointByBalanceId?: Map<string, AccountLowestPoint>;
  autoMovesByDestination?: Map<string, { incomeId: string; incomeName: string; amount: number }[]>;
  currency?: string;
  today?: string;
  previewMode?: boolean;
}) {
  const [modalState, setModalState] = useState<null | "new" | BalanceRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [fundsModal, setFundsModal] = useState<null | { mode: "add" | "take" | "move"; balance: BalanceRow }>(null);
  const [historyBalance, setHistoryBalance] = useState<BalanceRow | null>(null);

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
            {balances.map((balance) => {
              const lowest = lowestPointByBalanceId.get(balance.id);
              const autoMoves = autoMovesByDestination.get(balance.id) ?? [];
              return (
              <li
                key={balance.id}
                className="flex flex-col gap-3 rounded-lg border border-notion-hairline bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-notion-text">{balance.name}</p>
                  <p className="text-lg font-medium text-notion-text">{formatCentavos(balance.amount, currency)}</p>
                  {lowest && (
                    <p className="text-xs text-slate-400">
                      {lowest.date === today
                        ? `Not projected to dip below ${formatCentavos(lowest.balance, currency)}`
                        : `Lowest projected: ${formatCentavos(lowest.balance, currency)} on ${formatFullDate(lowest.date)}`}
                    </p>
                  )}
                  {balance.comments && (
                    <p className="text-sm text-slate-400">{balance.comments}</p>
                  )}
                  {/* T212: each rule links straight to editing the income
                      behind it (IncomeClient.tsx's own ?editIncome=
                      handling) - this pill is the "label" that request
                      asked for, and the link is the "way to edit that
                      income" asked for alongside it. */}
                  {autoMoves.map((autoMove) => (
                    <Link
                      key={autoMove.incomeId}
                      href={`/income?editIncome=${autoMove.incomeId}`}
                      className="mt-1 block w-fit rounded-full bg-notion-hover px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-notion-hairline"
                      title="Click to edit this income's auto-move rule"
                    >
                      Receives {formatCentavos(autoMove.amount, currency)} from {autoMove.incomeName} on settle
                    </Link>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
                      {/* T186: Add/Take/Move funds - the logged, commentable
                          replacement for directly editing the amount above,
                          mirroring the Budget page's own button row (T75).
                          Kept as the visually primary group; History/Edit/
                          Delete are less-frequent management actions, so
                          they're icon-only (with a hover tooltip and
                          aria-label) rather than a second row of equally
                          loud text pills - user feedback that six same-
                          weight buttons per row read as cluttered. Still no
                          dropdown menu, matching BudgetCard's own established
                          "always-visible over a menu" precedent (T75). */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFundsModal({ mode: "add", balance })}
                          className="rounded border border-notion-hairline px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-notion-hover"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => setFundsModal({ mode: "take", balance })}
                          className="rounded border border-notion-hairline px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-notion-hover"
                        >
                          Take
                        </button>
                        {balances.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setFundsModal({ mode: "move", balance })}
                            className="rounded border border-notion-hairline px-2.5 py-1 text-xs font-medium text-notion-accent hover:bg-notion-hover"
                          >
                            Move
                          </button>
                        )}
                      </div>
                      <div className="h-5 w-px bg-notion-hairline" />
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setHistoryBalance(balance)}
                          title="History"
                          aria-label="History"
                          className="rounded p-1.5 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
                        >
                          <HistoryIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalState(balance)}
                          title="Edit"
                          aria-label="Edit"
                          className="rounded p-1.5 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
                        >
                          <EditIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(balance.id)}
                          title="Delete"
                          aria-label="Delete"
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <DeleteIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </li>
              );
            })}
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

        {fundsModal && (
          <AccountFundsModal
            mode={fundsModal.mode}
            balance={fundsModal.balance}
            balances={balances}
            onClose={() => setFundsModal(null)}
          />
        )}

        {historyBalance && (
          <AccountHistoryModal
            balanceName={historyBalance.name}
            transactions={transactionsByBalanceId.get(historyBalance.id) ?? []}
            onClose={() => setHistoryBalance(null)}
          />
        )}
      </div>
      </div>
    </>
  );
}
