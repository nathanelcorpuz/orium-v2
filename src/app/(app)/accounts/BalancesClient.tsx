"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCentavos } from "@/lib/money";
import { formatFullDate, todayInManila } from "@/lib/date";
import { PreviewModeBar } from "@/components/PreviewModeBar";
import { MockRunBanner } from "@/components/MockRunBanner";
import { useMockRun } from "@/components/MockRunContext";
import { SubmitButton } from "@/components/SubmitButton";
import { ChevronIcon, DeleteIcon, EditIcon, HistoryIcon } from "@/components/navIcons";
import type { AccountLowestPoint } from "@/lib/engine/accountBalances";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/forecastLabels";
import {
  computeAccountMonthlyBreakdown,
  type AutoMoveItem,
  type BudgetFundingItem,
  type MonthlyBreakdownItem,
  type OneTimeItem,
} from "@/lib/accountMonthlyBreakdown";
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
  // T236 (replaces the removed /allocation page): every recurring item
  // (full recurrence shape, needed for an accurate monthly estimate) and
  // every connected one-off, for the per-account breakdown below. Default
  // to empty so preview mode (which only ever passes `recurringItems`) and
  // any other caller that doesn't need this feature stay valid.
  recurringItems = [],
  oneOffItems = [],
  // T236 follow-up (2026-08-03): "bdo tatay does not consider the received
  // funds as income" / "UB Nanay has an 88k monthly income, which is
  // inaccurate because some of those funds are being auto moved to bdo
  // tatay" - the same raw rows `autoMovesByDestination` above already
  // carries, fed into `computeAccountMonthlyBreakdown` instead of just the
  // settle-time pill.
  autoMoves = [],
  // Bug fix 2026-08-04: an income-linked budget's replenishment (T151/Bug
  // #14) nets out of the income's own connected account, same reasoning as
  // autoMoves above - defaults to empty for preview mode.
  budgets = [],
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
  recurringItems?: MonthlyBreakdownItem[];
  oneOffItems?: OneTimeItem[];
  autoMoves?: AutoMoveItem[];
  budgets?: BudgetFundingItem[];
  previewMode?: boolean;
}) {
  const [modalState, setModalState] = useState<null | "new" | BalanceRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [fundsModal, setFundsModal] = useState<null | { mode: "add" | "take" | "move"; balance: BalanceRow }>(null);
  const [historyBalance, setHistoryBalance] = useState<BalanceRow | null>(null);
  // T236: which accounts currently have their monthly breakdown expanded -
  // a transient per-view preference, not persisted, same as BalanceModal's
  // own connected-items collapse toggle.
  const [expandedBreakdownIds, setExpandedBreakdownIds] = useState<Set<string>>(new Set());
  function toggleBreakdown(id: string) {
    setExpandedBreakdownIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Mock run v1: when active, every account's displayed amount comes from
  // the mocked clone instead of the real prop - name/comments/fee etc. stay
  // real, only `amount` is ever swapped, since mock mode only ever touches
  // Add/Take/Move funds in this first cut.
  const mockRun = useMockRun();
  const mockAmountById = new Map(mockRun.balances.map((b) => [b.id, b.amount]));
  const effectiveBalances = mockRun.active
    ? balances.map((b) => ({ ...b, amount: mockAmountById.get(b.id) ?? b.amount }))
    : balances;

  const total = effectiveBalances.reduce((sum, balance) => sum + balance.amount, 0);
  const balanceNameById = new Map(balances.map((b) => [b.id, b.name]));

  return (
    <>
      {previewMode && <PreviewModeBar />}
      <div className="p-8">
      <div className="mx-auto max-w-2xl">
        <MockRunBanner />
        <div data-tour="accounts-header" className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">Accounts</h1>
            <p className="text-slate-500">Total: {formatCentavos(total)}</p>
          </div>
          {!previewMode && (
            <div className="flex shrink-0 items-center gap-2">
              {!mockRun.active && (
                <button
                  type="button"
                  onClick={() => mockRun.start(balances.map((b) => ({ id: b.id, name: b.name, amount: b.amount })))}
                  className="rounded border border-orange-300 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
                  title="Try Add/Take/Move funds hypothetically, without saving anything"
                >
                  Mock run
                </button>
              )}
              <button
                type="button"
                onClick={() => setModalState("new")}
                className="shrink-0 rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
              >
                Add account
              </button>
            </div>
          )}
        </div>

        {balances.length === 0 ? (
          <p className="text-slate-500">No accounts yet. Add your first account above.</p>
        ) : (
          <ul className="space-y-2">
            {effectiveBalances.map((balance) => {
              const lowest = lowestPointByBalanceId.get(balance.id);
              const incomingAutoMovePills = autoMovesByDestination.get(balance.id) ?? [];
              // T236 (replaces the removed /allocation page): "the amount
              // each account received monthly, the amount each account is
              // deducted monthly, the sum of those two" - plus a breakdown
              // by every item's own actual recurrence, expandable per
              // account so it doesn't crowd the row by default.
              const breakdown = computeAccountMonthlyBreakdown(
                recurringItems,
                oneOffItems,
                autoMoves,
                budgets,
                balanceNameById,
                balance.id,
              );
              const hasBreakdown =
                breakdown.frequencyGroups.length > 0 ||
                breakdown.oneTime.length > 0 ||
                breakdown.autoMoves.length > 0 ||
                breakdown.budgetFunds.length > 0;
              const breakdownOpen = expandedBreakdownIds.has(balance.id);
              return (
              <li
                key={balance.id}
                className="flex flex-col gap-3 rounded-lg border border-notion-hairline bg-white p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                  {incomingAutoMovePills.map((autoMove) => (
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
                </div>

                {hasBreakdown && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleBreakdown(balance.id)}
                      aria-expanded={breakdownOpen}
                      className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-notion-text"
                    >
                      <ChevronIcon
                        direction="right"
                        className={`h-3 w-3 transition-transform ${breakdownOpen ? "rotate-90" : ""}`}
                      />
                      {breakdown.monthlyReceived > 0 && (
                        <span className="text-green-700">
                          +{formatCentavos(breakdown.monthlyReceived, currency)}/mo
                        </span>
                      )}
                      {breakdown.monthlyDeducted < 0 && (
                        <span className="text-red-600">
                          {formatCentavos(breakdown.monthlyDeducted, currency)}/mo
                        </span>
                      )}
                      <span className={breakdown.monthlyNet < 0 ? "text-red-600" : "text-notion-text"}>
                        = {formatCentavos(breakdown.monthlyNet, currency)}/mo net
                      </span>
                    </button>
                    {breakdownOpen && (
                      <div className="mt-2 space-y-3 border-l-2 border-notion-hairline pl-3">
                        {breakdown.frequencyGroups.map((group) => (
                          <div key={group.label}>
                            <p className="mb-1 text-xs font-semibold text-slate-500">{group.label}</p>
                            <ul className="divide-y divide-notion-hairline">
                              {group.items.map((item) => {
                                const colorClass = TYPE_COLOR[item.type] ?? "text-notion-text";
                                return (
                                  <li key={item.id} className="flex items-center gap-2 py-1 text-sm">
                                    <span className="min-w-0 flex-1 truncate text-notion-text">
                                      {item.name}{" "}
                                      <span className={`text-xs font-medium ${colorClass}`}>
                                        {TYPE_LABEL[item.type]}
                                      </span>
                                      {item.autoDebited && (
                                        <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                                          Auto-debited
                                        </span>
                                      )}
                                    </span>
                                    <span className={`shrink-0 tabular-nums ${colorClass}`}>
                                      {formatCentavos(item.amount, currency)}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                        {breakdown.autoMoves.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-semibold text-slate-500">Auto-moves</p>
                            <ul className="divide-y divide-notion-hairline">
                              {breakdown.autoMoves.map((flow) => (
                                <li key={flow.id} className="flex items-center gap-2 py-1 text-sm">
                                  <span className="min-w-0 flex-1 truncate text-notion-text">{flow.label}</span>
                                  <span
                                    className={`shrink-0 tabular-nums ${flow.amount >= 0 ? "text-green-700" : "text-red-600"}`}
                                  >
                                    {formatCentavos(flow.amount, currency)}/mo
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {breakdown.budgetFunds.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-semibold text-slate-500">Funds budgets</p>
                            <ul className="divide-y divide-notion-hairline">
                              {breakdown.budgetFunds.map((flow) => (
                                <li key={flow.id} className="flex items-center gap-2 py-1 text-sm">
                                  <span className="min-w-0 flex-1 truncate text-notion-text">{flow.label}</span>
                                  <span className="shrink-0 tabular-nums text-red-600">
                                    {formatCentavos(flow.amount, currency)}/mo
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {breakdown.oneTime.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-semibold text-slate-500">One-time</p>
                            <ul className="divide-y divide-notion-hairline">
                              {breakdown.oneTime.map((item) => (
                                <li key={item.id} className="flex items-center gap-2 py-1 text-sm">
                                  <span className="min-w-0 flex-1 truncate text-notion-text">
                                    {item.name}{" "}
                                    <span className="text-xs text-slate-400">
                                      due {formatFullDate(item.dueDate)}
                                    </span>
                                  </span>
                                  <span className="shrink-0 tabular-nums text-purple-700">
                                    {formatCentavos(item.amount, currency)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
            balances={effectiveBalances}
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
