"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { SegmentedControl } from "@/components/SegmentedControl";
import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import { EditSettleModal } from "@/app/(app)/forecast/EditSettleModal";
import { resolveAutoMoves } from "@/app/(app)/forecast/resolveAutoMoves";
import { getItemTransactions, type ItemSettlementRow } from "@/lib/itemTransactions";
import type { ForecastRow, IncomeAutoMoveOverride, RecurringItemType } from "@/lib/engine/types";

export type SettlementRow = ItemSettlementRow;

// Debt/Savings item detail (user request 2026-07-24): clicking an item shows
// its upcoming (still-forecasted) occurrences and its paid (settled)
// transactions - "upcoming" reuses the already-computed, override-aware
// forecast rows for this item; "paid" reads directly from `settlements`.
//
// T188 (user request): a row with the "edited from its usual schedule" mark
// (✎) needed a way to actually change that occurrence from here, not just
// see that it was changed - clicking an upcoming row now opens the exact
// same `EditSettleModal` the Forecast page (table and calendar views alike)
// already uses, rather than a second edit surface for the same
// occurrence_overrides row.
//
// Lazy loading (user request 2026-08-01): used to receive `upcoming`/`paid`
// as props, precomputed for every item on the page's own initial load. Now
// fetches just this one item's data itself, on mount - i.e. only once this
// modal is actually opened. See itemTransactions.ts's own comment for why
// the underlying engine call isn't itself cheaper, just deferred and
// narrowed to one item.
export function ItemTransactionsModal({
  name,
  itemId,
  itemType,
  currency,
  balances,
  // T212 follow-up: only ever non-empty when this modal was opened for an
  // income (IncomeClient.tsx passes its own already-computed maps; Bills/
  // Debt/Savings never do, since only income has auto-move rules) - lets a
  // clicked upcoming occurrence show the same "Auto-moves:" line
  // EditSettleModal shows from the Forecast page itself. T224: resolved per
  // the clicked occurrence's own date via resolveAutoMoves.ts, same as the
  // Forecast page's table/calendar views, rather than a flat per-income
  // summary - so a per-occurrence edit made from the Forecast page shows up
  // here too, and vice versa.
  autoMoveRulesByIncomeId = new Map(),
  autoMoveOverrideByKey = new Map(),
  onClose,
}: {
  name: string;
  itemId: string;
  itemType: RecurringItemType;
  currency: string;
  balances: { id: string; name: string }[];
  autoMoveRulesByIncomeId?: Map<string, { id: string; destinationBalanceId: string; amount: number }[]>;
  autoMoveOverrideByKey?: Map<string, IncomeAutoMoveOverride>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"upcoming" | "paid">("upcoming");
  const [editingRow, setEditingRow] = useState<ForecastRow | null>(null);
  const [data, setData] = useState<{ upcoming: ForecastRow[]; paid: ItemSettlementRow[] } | null>(null);

  // No `setData(null)` reset here: this modal only ever mounts fresh for a
  // given item (the caller renders it from `{viewingItem && <...>}`, never
  // swapping `itemId` on an already-mounted instance), so the initial
  // `useState(null)` above already covers the "nothing loaded yet" state.
  useEffect(() => {
    let cancelled = false;
    getItemTransactions(itemId, itemType).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [itemId, itemType]);

  // T174: a scenario-sourced row's sourceId belongs to scenario_recurring_items,
  // not recurring_items - EditSettleModal's actions would write against an id
  // that doesn't exist in the tables they actually know about. Same guard
  // ForecastClient/CalendarGrid already apply.
  if (editingRow) {
    const balanceNameById = new Map(balances.map((b) => [b.id, b.name]));
    return (
      <EditSettleModal
        row={editingRow}
        currency={currency}
        balances={balances}
        autoMoves={
          editingRow.sourceType === "recurring" && editingRow.type === "income"
            ? resolveAutoMoves(
                editingRow.sourceId,
                editingRow.originalDate,
                autoMoveRulesByIncomeId,
                autoMoveOverrideByKey,
                balanceNameById,
              )
            : null
        }
        onClose={() => setEditingRow(null)}
      />
    );
  }

  const upcoming = data?.upcoming ?? [];
  const paid = data?.paid ?? [];

  return (
    <Modal title={`${name} - Transactions`} onClose={onClose}>
      <div className="mb-4">
        <SegmentedControl
          options={[
            { value: "upcoming", label: `Upcoming (${upcoming.length})` },
            { value: "paid", label: `Paid (${paid.length})` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {!data ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : tab === "upcoming" ? (
        upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">No upcoming occurrences.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-notion-hairline overflow-y-auto">
            {upcoming.map((row, index) => {
              const clickable = !row.fromScenario;
              return (
                <li
                  key={`${row.originalDate}-${index}`}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => setEditingRow(row) : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setEditingRow(row);
                          }
                        }
                      : undefined
                  }
                  className={`flex items-center justify-between py-2 text-sm first:pt-0 ${
                    clickable ? "cursor-pointer hover:opacity-70" : ""
                  }`}
                >
                  <span className="text-notion-text">
                    {formatFullDate(row.dueDate)}
                    {row.edited && (
                      <span className="ml-1.5 text-slate-400" title="Edited from its usual schedule">
                        ✎
                      </span>
                    )}
                  </span>
                  <span className="font-medium text-notion-text">{formatCentavos(Math.abs(row.amount))}</span>
                </li>
              );
            })}
          </ul>
        )
      ) : paid.length === 0 ? (
        <p className="text-sm text-slate-500">No paid transactions yet.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-notion-hairline overflow-y-auto">
          {paid.map((row) => {
            const differs = row.forecasted_date !== row.actual_date || row.forecasted_amount !== row.actual_amount;
            return (
              <li key={row.id} className="py-2 text-sm first:pt-0">
                <div className="flex items-center justify-between">
                  <span className="text-notion-text">{formatFullDate(row.actual_date)}</span>
                  <span className="font-medium text-notion-text">
                    {formatCentavos(Math.abs(row.actual_amount))}
                  </span>
                </div>
                {differs && (
                  <p className="text-xs text-slate-400">
                    Forecasted {formatFullDate(row.forecasted_date)},{" "}
                    {formatCentavos(Math.abs(row.forecasted_amount))}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
