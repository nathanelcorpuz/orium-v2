"use client";

import { Modal } from "@/components/Modal";
import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";

export type BalanceTransactionRow = {
  id: string;
  entry_date: string;
  amount: number;
  direction: "incoming" | "outgoing";
  note: string | null;
};

// T186 follow-up (user request): "quickly see edits" on an account - a
// read-only list over its own balance_transactions (T186's Add/Take/Move
// funds ledger), most recent first. No edit/delete here - this is a look-
// back view, not a second place to manage the ledger from.
export function AccountHistoryModal({
  balanceName,
  transactions,
  onClose,
}: {
  balanceName: string;
  transactions: BalanceTransactionRow[];
  onClose: () => void;
}) {
  return (
    <Modal title={`${balanceName} - History`} onClose={onClose}>
      {transactions.length === 0 ? (
        <p className="text-sm text-slate-500">
          No Add/Take/Move funds transactions yet for this account.
        </p>
      ) : (
        <ul className="max-h-96 divide-y divide-notion-hairline overflow-y-auto">
          {transactions.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between py-2 text-sm first:pt-0">
              <span className="text-slate-500">
                {formatFullDate(entry.entry_date)}
                {entry.note && <span className="italic text-slate-400"> - {entry.note}</span>}
              </span>
              <span className={`shrink-0 font-medium ${entry.direction === "incoming" ? "text-green-700" : "text-red-600"}`}>
                {entry.direction === "incoming" ? "+" : "-"}
                {formatCentavos(entry.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
