import type { RecurringItem } from "@/lib/engine/types";

// T71 (SPEC.md Phase 12): a bill/income/debt/savings/extra currently linked
// to an account, for the "connected items" view in that account's own edit
// modal.
//
// T152 (Bug #12): this used to live in `accounts/BalancesClient.tsx` with the
// queries inlined in `accounts/page.tsx`, which meant the Forecast page - which
// opens the very same `BalanceModal` from its balance chips - had no way to
// produce the data without copying them. It didn't copy them, so the Forecast's
// version of the modal silently showed no connected items at all. Moved here so
// there is one implementation both pages call, rather than two that can drift.
//
// Deliberately kept free of any server import: `BalanceModal`/`BalancesClient`
// (client components) import this type, and the fixture mapper below is a pure
// function with its own test. The Supabase query that needs `next/headers`
// lives in `connectedItemsData.ts` instead, so neither concern drags the other
// into a bundle or a test run.
export type ConnectedItem = {
  id: string;
  name: string;
  amount: number;
  balanceId: string;
  sourceType: "recurring" | "one_off";
  type: string;
};

/**
 * Connected items derived from the read-only sample fixture, for `?preview=1`
 * on the Balances and Forecast pages. Recurring items only - `ForecastData`
 * doesn't carry the fixture's one-offs, and preview mode only needs enough to
 * look real.
 */
export function connectedItemsFromFixture(recurringItems: RecurringItem[]): ConnectedItem[] {
  return recurringItems
    .filter((item) => item.balanceId !== null)
    .map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      balanceId: item.balanceId as string,
      sourceType: "recurring" as const,
      type: item.type,
    }));
}
