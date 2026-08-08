"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
import { blockNegativeKey, parseCentavos } from "@/lib/money";
import type { BalanceRow } from "@/app/(app)/accounts/BalanceModal";
import type { PreviewChange } from "@/lib/previewFundsMove";

// Feature (user request 2026-08-08): the input side of the "preview a
// change" flow - deliberately not a server-action form like AccountFundsModal
// (accounts/AccountFundsModal.tsx). Submitting here computes a hypothetical
// only, in memory, and hands it back to ForecastClient to display; nothing is
// written until the user later clicks "Apply for real" on the resulting
// banner.
export function PreviewFundsPanel({
  balances,
  onPreview,
  onClose,
}: {
  balances: BalanceRow[];
  onPreview: (change: PreviewChange) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"add" | "take" | "move">("move");
  const [balanceId, setBalanceId] = useState(balances[0]?.id ?? "");
  const [toBalanceId, setToBalanceId] = useState(balances[1]?.id ?? "");
  const [amountPesos, setAmountPesos] = useState("");
  const [error, setError] = useState<string | null>(null);

  const balance = balances.find((b) => b.id === balanceId);
  const otherBalances = balances.filter((b) => b.id !== balanceId);
  const toBalance = otherBalances.find((b) => b.id === toBalanceId) ?? otherBalances[0];

  function handleFromChange(nextId: string) {
    setBalanceId(nextId);
    if (toBalanceId === nextId) {
      setToBalanceId(balances.find((b) => b.id !== nextId)?.id ?? "");
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const amount = parseCentavos(amountPesos);
    if (amount === null || amount <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!balance) {
      setError("Choose an account.");
      return;
    }
    if (mode === "move") {
      if (!toBalance || toBalance.id === balance.id) {
        setError("Choose two different accounts.");
        return;
      }
      onPreview({
        mode: "move",
        fromId: balance.id,
        fromName: balance.name,
        toId: toBalance.id,
        toName: toBalance.name,
        amount,
        fee: balance.transaction_fee_centavos ?? 0,
      });
    } else {
      onPreview({ mode, balanceId: balance.id, balanceName: balance.name, amount });
    }
    onClose();
  }

  return (
    <Modal title="Preview a change" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">
        See how adding, taking, or moving funds would ripple through your forecast before it&apos;s
        real. Nothing is saved until you choose to apply it.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex overflow-hidden rounded border border-notion-hairline text-xs">
          {(["add", "take", "move"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 px-3 py-1.5 capitalize ${mode === m ? "bg-notion-text text-white" : "bg-white text-notion-text hover:bg-notion-hover"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="preview-balance">
            {mode === "move" ? "From" : "Account"}
          </label>
          <select
            id="preview-balance"
            value={balanceId}
            onChange={(event) => handleFromChange(event.target.value)}
            required
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          >
            {balances.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {mode === "move" && (
          <div>
            <label className="block text-sm text-slate-600" htmlFor="preview-to-balance">
              To
            </label>
            <select
              id="preview-to-balance"
              value={toBalance?.id ?? ""}
              onChange={(event) => setToBalanceId(event.target.value)}
              required
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            >
              {otherBalances.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="preview-amount">
            Amount (₱)
          </label>
          <input
            id="preview-amount"
            type="number"
            step="0.01"
            min="0"
            required
            value={amountPesos}
            onChange={(event) => setAmountPesos(event.target.value)}
            onKeyDown={blockNegativeKey}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!balance || (mode === "move" && !toBalance)}
            className="rounded bg-notion-accent px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
          >
            Preview
          </button>
        </div>
      </form>
    </Modal>
  );
}
