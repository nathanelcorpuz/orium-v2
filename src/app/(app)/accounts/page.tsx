import { createClient } from "@/lib/supabase/server";
import { getSampleFixtureData } from "@/lib/sampleFixture";
import { connectedItemsFromFixture } from "@/lib/connectedItems";
import { loadConnectedItems } from "@/lib/connectedItemsData";
import { loadForecast } from "@/lib/forecastData";
import { findAccountLowestPoints } from "@/lib/engine/accountBalances";
import { BalancesClient } from "./BalancesClient";

export default async function BalancesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // T120: the short tour (T116/T119) now walks through this page, and a
  // brand-new account has nothing here to look at - so `?preview=1` renders
  // the same read-only sample fixture Dashboard/Forecast already use (T103),
  // purely as visual placeholders. Nothing is written, and every mutating
  // control is disabled while it's on.
  const preview = (await searchParams).preview === "1";
  if (preview) {
    const fixture = getSampleFixtureData();
    return (
      <BalancesClient
        balances={fixture.balances}
        connectedItems={connectedItemsFromFixture(fixture.recurringItems)}
        previewMode
      />
    );
  }

  const supabase = await createClient();
  // T71's connected-items queries moved into `loadConnectedItems` (T152) so
  // the Forecast page can build the same data for the same modal.
  const [{ data: balances, error }, connectedItems, transactionsRes, forecastData] = await Promise.all([
    supabase
      .from("balances")
      .select("id, name, amount, comments, transaction_fee_centavos")
      .order("created_at", { ascending: true }),
    loadConnectedItems(),
    // T186 follow-up: "quickly see edits" on an account - its own Add/Take/
    // Move funds history (balance_transactions), most recent first.
    supabase
      .from("balance_transactions")
      .select("id, balance_id, entry_date, amount, direction, note, created_at")
      .order("created_at", { ascending: false }),
    // T180 follow-up (user feedback: the Forecast page's hover-only tooltip
    // was too easy to miss): the same per-account "lowest projected
    // balance" stat, shown directly and visibly on this page instead.
    loadForecast(),
  ]);

  if (error) {
    return <p className="p-8 text-red-600">Could not load balances: {error.message}</p>;
  }

  const transactionsByBalanceId = new Map<string, NonNullable<typeof transactionsRes.data>>();
  for (const row of transactionsRes.data ?? []) {
    const list = transactionsByBalanceId.get(row.balance_id) ?? [];
    list.push(row);
    transactionsByBalanceId.set(row.balance_id, list);
  }

  const lowestPointByBalanceId = findAccountLowestPoints(
    forecastData.forecast,
    forecastData.balances,
    forecastData.today,
  );

  return (
    <BalancesClient
      balances={balances ?? []}
      connectedItems={connectedItems}
      transactionsByBalanceId={transactionsByBalanceId}
      lowestPointByBalanceId={lowestPointByBalanceId}
      currency={forecastData.currency}
      today={forecastData.today}
    />
  );
}
