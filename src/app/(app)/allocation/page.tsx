import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { findAccountLowestPoints } from "@/lib/engine/accountBalances";
import { monthlyEquivalent } from "@/lib/engine/monthlyTotals";
import { AllocationClient, type AccountGroup, type PayableItem } from "./AllocationClient";

// SPEC.md "Fund-distribution planning" (Before MVP launch discussion,
// resolved into T232/T233/T234 plus this page, 2026-08-03): the user's own
// framing was "I can see we're not negative in the entirety of the forecast
// but seeing negative lowest projected on some accounts despite that is
// uncomfortable... I need to be able to quickly know how to best distribute
// the accounts to the payables." T180 already computes each account's own
// lowest-projected-balance-ahead; what was missing was a single place that
// lists every payable connected to each account next to that stat, with a
// way to move one to a different account without leaving the page. Auto-
// debited items (T232) are pinned - shown, not offered a reassign control.
export default async function AllocationPage() {
  const supabase = await createClient();
  const [forecastData, oneOffsRes] = await Promise.all([
    loadForecast(),
    supabase.from("one_off_items").select("id, name, amount, balance_id, due_date"),
  ]);

  const { balances, recurringItems, forecast, today, balanceRanges, currency } = forecastData;
  const lowestPoints = findAccountLowestPoints(forecast, balances, today);

  // Bills/Debt/Savings only - the "payables" the user's own request named.
  // Income isn't something an account "pays", and budgets are a separate
  // storage layer (budget_accounts) that never appears in the forecast at
  // all (T204), so there's nothing to reassign there either.
  const payables: PayableItem[] = [
    ...recurringItems
      .filter((item) => item.type !== "income")
      .map((item) => ({
        sourceType: "recurring" as const,
        id: item.id,
        name: item.name,
        type: item.type as "bill" | "debt" | "savings",
        balanceId: item.balanceId,
        autoDebited: item.autoDebited === true,
        monthlyAmount: monthlyEquivalent({
          amount: item.amount,
          interval: item.interval,
          unit: item.unit,
          weekdays: item.weekdays,
          daysOfMonth: item.daysOfMonth,
        }),
        amount: item.amount,
        dueDate: null,
      })),
    ...(oneOffsRes.data ?? []).map((row) => ({
      sourceType: "one_off" as const,
      id: row.id,
      name: row.name,
      type: "extra" as const,
      balanceId: row.balance_id,
      autoDebited: false,
      monthlyAmount: null,
      amount: row.amount,
      dueDate: row.due_date as string | null,
    })),
  ];

  const accounts: AccountGroup[] = balances
    .map((balance) => {
      const items = payables.filter((item) => item.balanceId === balance.id);
      return {
        id: balance.id,
        name: balance.name,
        amount: balance.amount,
        lowestPoint: lowestPoints.get(balance.id) ?? null,
        items,
        monthlyTotal: items.reduce((sum, item) => sum + (item.monthlyAmount ?? 0), 0),
      };
    })
    // Most-at-risk account first - the whole point of this page is spotting
    // which account needs rebalancing without scanning every card.
    .sort((a, b) => {
      const aBalance = a.lowestPoint ? a.lowestPoint.balance : Infinity;
      const bBalance = b.lowestPoint ? b.lowestPoint.balance : Infinity;
      return aBalance - bBalance;
    });

  const unassigned = payables.filter((item) => item.balanceId === null);

  return (
    <AllocationClient
      accounts={accounts}
      unassigned={unassigned}
      balanceOptions={balances.map((balance) => ({ id: balance.id, name: balance.name }))}
      balanceRanges={balanceRanges}
      currency={currency}
    />
  );
}
