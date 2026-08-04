"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { blockNegativeKey, parseCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { addAccountFunds, moveAccountFunds, takeAccountFunds, type BalanceActionState } from "./actions";
import { useMockRun } from "@/components/MockRunContext";
import type { BalanceRow } from "./BalanceModal";

const initialState: BalanceActionState = { error: null };

// Same validation `readFundsForm` (actions.ts) applies server-side -
// duplicated rather than imported, since a `"use server"` file can only
// export server actions, not a plain helper a client component could reuse.
function validateFundsForm(formData: FormData): { error: string | null } {
  const amount = parseCentavos(formData.get("amountPesos") as string);
  if (amount === null || amount <= 0) return { error: "Enter a valid amount." };
  if (!(formData.get("entryDate") as string)) return { error: "Date is required." };
  return { error: null };
}

// T186: Add funds / Take funds / Move funds - the logged, commentable
// replacement for directly editing an account's amount, mirroring the
// Budget page's own Add funds/Take funds modal (FundsModal.tsx, T75) but
// extended with a note field (this task's own ask) and a third "move"
// mode transferring between two of the user's own accounts.
export function AccountFundsModal({
  mode,
  balance,
  balances,
  onClose,
}: {
  mode: "add" | "take" | "move";
  balance: BalanceRow;
  balances: BalanceRow[];
  onClose: () => void;
}) {
  const mockRun = useMockRun();

  // Mock run v1: while active, Add/Take/Move funds apply to the local
  // cloned balances (MockRunContext) instead of the real server actions -
  // same form, same validation, nothing written to the database. Matches
  // `BalanceActionState`'s exact shape so `useActionState` below can't tell
  // the difference.
  async function mockAdd(_prevState: BalanceActionState, formData: FormData): Promise<BalanceActionState> {
    const validation = validateFundsForm(formData);
    if (validation.error) return validation;
    mockRun.applyAdd(
      formData.get("balanceId") as string,
      formData.get("balanceName") as string,
      formData.get("amountPesos") as string,
      formData.get("entryDate") as string,
      ((formData.get("note") as string) || "").trim(),
    );
    return { error: null };
  }

  async function mockTake(_prevState: BalanceActionState, formData: FormData): Promise<BalanceActionState> {
    const validation = validateFundsForm(formData);
    if (validation.error) return validation;
    mockRun.applyTake(
      formData.get("balanceId") as string,
      formData.get("balanceName") as string,
      formData.get("amountPesos") as string,
      formData.get("entryDate") as string,
      ((formData.get("note") as string) || "").trim(),
    );
    return { error: null };
  }

  async function mockMove(_prevState: BalanceActionState, formData: FormData): Promise<BalanceActionState> {
    const validation = validateFundsForm(formData);
    if (validation.error) return validation;
    const toId = formData.get("toBalanceId") as string;
    const fromId = formData.get("fromBalanceId") as string;
    if (!toId) return { error: "Choose an account to move funds to." };
    if (fromId === toId) return { error: "Choose two different accounts." };
    mockRun.applyMove(
      fromId,
      formData.get("fromBalanceName") as string,
      toId,
      formData.get("toBalanceName") as string,
      formData.get("amountPesos") as string,
      formData.get("entryDate") as string,
      ((formData.get("note") as string) || "").trim(),
    );
    return { error: null };
  }

  const realAction = mode === "add" ? addAccountFunds : mode === "take" ? takeAccountFunds : moveAccountFunds;
  const mockAction = mode === "add" ? mockAdd : mode === "take" ? mockTake : mockMove;
  const action = mockRun.active ? mockAction : realAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const submitted = useRef(false);
  const otherBalances = balances.filter((b) => b.id !== balance.id);
  const [toBalanceId, setToBalanceId] = useState(otherBalances[0]?.id ?? "");

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
    }
  }, [pending, state, onClose]);

  const title = mode === "add" ? "Add funds" : mode === "take" ? "Take funds" : "Move funds";
  const buttonColor = mode === "add" ? "bg-green-700" : mode === "take" ? "bg-red-600" : "bg-notion-accent";

  return (
    <Modal title={`${balance.name} - ${title}`} onClose={onClose}>
      {mockRun.active && (
        <p className="mb-3 rounded bg-orange-50 px-3 py-2 text-sm text-orange-800">
          Mock run - this won&apos;t be saved until you choose &quot;Make this real.&quot;
        </p>
      )}
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        <input type="hidden" name="entryDate" value={todayInManila()} />
        {mode === "move" ? (
          <>
            <input type="hidden" name="fromBalanceId" value={balance.id} />
            <input type="hidden" name="fromBalanceName" value={balance.name} />
            <input type="hidden" name="toBalanceId" value={toBalanceId} />
            <input
              type="hidden"
              name="toBalanceName"
              value={otherBalances.find((b) => b.id === toBalanceId)?.name ?? ""}
            />
            <div>
              <label className="block text-sm text-slate-600" htmlFor="toBalanceSelect">
                Move to
              </label>
              <select
                id="toBalanceSelect"
                value={toBalanceId}
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
          </>
        ) : (
          <>
            <input type="hidden" name="balanceId" value={balance.id} />
            <input type="hidden" name="balanceName" value={balance.name} />
          </>
        )}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="amountPesos">
            Amount (₱)
          </label>
          <input
            id="amountPesos"
            name="amountPesos"
            type="number"
            step="0.01"
            min="0"
            required
            onKeyDown={blockNegativeKey}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="note">
            Comment (optional)
          </label>
          <input
            id="note"
            name="note"
            type="text"
            placeholder={mode === "move" ? "Defaults to “Moved to/from…”" : ""}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
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
            disabled={pending || (mode === "move" && !toBalanceId)}
            className={`rounded px-4 py-2 text-white hover:opacity-90 disabled:opacity-50 ${buttonColor}`}
          >
            {pending ? "Saving..." : title}
          </button>
        </div>
      </form>
    </Modal>
  );
}
