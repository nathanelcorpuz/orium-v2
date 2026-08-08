import type { BalanceRow } from "@/app/(app)/accounts/BalanceModal";
import { formatCentavos } from "./money";

// Feature (user request 2026-08-08): "see what will happen if I move certain
// funds between accounts in the forecast, then I can opt out from it as if
// it didn't happen, or I can apply that change permanently." A hypothetical
// Add/Take/Move funds change, computed and shown entirely client-side -
// nothing is written to the database until the user explicitly applies it,
// via the same accounts/actions.ts functions the Accounts page already uses
// for the real thing. Echoes the "mock run" sandbox tried and reverted
// 2026-08-04 (SPEC.md's "Before MVP launch" record); kept deliberately
// narrower this time - one hypothetical change at a time, no separate
// sandbox mode toggle, just preview-then-decide.
export type PreviewChange =
  | { mode: "add"; balanceId: string; balanceName: string; amount: number }
  | { mode: "take"; balanceId: string; balanceName: string; amount: number }
  | {
      mode: "move";
      fromId: string;
      fromName: string;
      toId: string;
      toName: string;
      amount: number;
      fee: number;
    };

// Same math as accounts/actions.ts's `adjustBalance`/`moveAccountFunds` - the
// sender always pays the fee here (the preview panel doesn't expose the
// receiver-pays toggle, to keep this flow small; Move funds' own modal still
// has the full toggle for anyone who needs it, reachable from the account's
// Edit screen either way).
export function computePreviewBalances(balances: BalanceRow[], change: PreviewChange): BalanceRow[] {
  return balances.map((balance) => {
    if (change.mode === "add" && balance.id === change.balanceId) {
      return { ...balance, amount: balance.amount + change.amount };
    }
    if (change.mode === "take" && balance.id === change.balanceId) {
      return { ...balance, amount: balance.amount - change.amount };
    }
    if (change.mode === "move" && balance.id === change.fromId) {
      return { ...balance, amount: balance.amount - change.amount - change.fee };
    }
    if (change.mode === "move" && balance.id === change.toId) {
      return { ...balance, amount: balance.amount + change.amount };
    }
    return balance;
  });
}

export function describePreviewChange(change: PreviewChange, currency: string): string {
  const amountText = formatCentavos(change.amount, currency);
  if (change.mode === "add") return `Previewing: add ${amountText} to ${change.balanceName}`;
  if (change.mode === "take") return `Previewing: take ${amountText} from ${change.balanceName}`;
  return `Previewing: move ${amountText} from ${change.fromName} to ${change.toName}`;
}
