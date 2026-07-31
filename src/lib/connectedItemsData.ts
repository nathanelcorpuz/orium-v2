import { createClient } from "@/lib/supabase/server";
import type { ConnectedItem } from "@/lib/connectedItems";

/**
 * Every recurring item and one-off currently linked to any account (T71).
 *
 * T152 (Bug #12): both the Balances page and the Forecast page's balance chips
 * open the same `BalanceModal`, so both need this. It used to be inlined in
 * `accounts/page.tsx` only, which is how the Forecast ended up showing an
 * account with no connections at all.
 *
 * Server-only, since it reaches for the request-scoped Supabase client. The
 * `ConnectedItem` type and the pure fixture mapper live in `connectedItems.ts`
 * so client components and tests can import those without pulling
 * `next/headers` in behind them.
 *
 * Returns an empty list rather than throwing if either query fails: connected
 * items are supplementary detail inside a modal, so a failure here should not
 * take down the page they're shown on.
 */
export async function loadConnectedItems(): Promise<ConnectedItem[]> {
  const supabase = await createClient();
  const [recurringRes, oneOffRes] = await Promise.all([
    supabase.from("recurring_items").select("id, name, type, amount, balance_id").not("balance_id", "is", null),
    // One-offs have no `type` column, since they're all conceptually "extra".
    supabase.from("one_off_items").select("id, name, amount, balance_id").not("balance_id", "is", null),
  ]);

  return [
    ...(recurringRes.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      balanceId: item.balance_id as string,
      sourceType: "recurring" as const,
      type: item.type,
    })),
    ...(oneOffRes.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      balanceId: item.balance_id as string,
      sourceType: "one_off" as const,
      type: "extra",
    })),
  ];
}
