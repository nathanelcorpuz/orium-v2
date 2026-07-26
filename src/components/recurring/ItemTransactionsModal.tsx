"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { SegmentedControl } from "@/components/SegmentedControl";
import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import type { ForecastRow } from "@/lib/engine/types";

export type SettlementRow = {
  id: string;
  name: string;
  forecasted_amount: number;
  actual_amount: number;
  forecasted_date: string;
  actual_date: string;
};

// Debt/Savings item detail (user request 2026-07-24): clicking an item shows
// its upcoming (still-forecasted) occurrences and its paid (settled)
// transactions - "upcoming" reuses the already-computed, override-aware
// forecast rows for this item; "paid" reads directly from `settlements`.
export function ItemTransactionsModal({
  name,
  upcoming,
  paid,
  onClose,
}: {
  name: string;
  upcoming: ForecastRow[];
  paid: SettlementRow[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"upcoming" | "paid">("upcoming");

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

      {tab === "upcoming" ? (
        upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">No upcoming occurrences.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-notion-hairline overflow-y-auto">
            {upcoming.map((row, index) => (
              <li
                key={`${row.originalDate}-${index}`}
                className="flex items-center justify-between py-2 text-sm first:pt-0"
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
            ))}
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
