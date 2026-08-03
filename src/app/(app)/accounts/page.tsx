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
        recurringItems={fixture.recurringItems}
        previewMode
      />
    );
  }

  const supabase = await createClient();
  // T71's connected-items queries moved into `loadConnectedItems` (T152) so
  // the Forecast page can build the same data for the same modal.
  const [{ data: balances, error }, connectedItems, transactionsRes, autoMovesRes, forecastData, oneOffsRes] =
    await Promise.all([
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
      // T212: which income auto-moves land in each account, for the
      // "Receives ₱X from {income} on settle" pill.
      supabase.from("income_auto_moves").select("id, income_id, destination_balance_id, amount"),
      // T180 follow-up (user feedback: the Forecast page's hover-only tooltip
      // was too easy to miss): the same per-account "lowest projected
      // balance" stat, shown directly and visibly on this page instead.
      // Also the source of `recurringItems` for T236's monthly breakdown
      // below - already carries every recurrence field and `autoDebited`.
      loadForecast(),
      // T236: one-off (Misc) items connected to an account, for that
      // account's "One-time" breakdown group - `loadConnectedItems()`
      // deliberately omits `due_date` since the existing "Connected items"
      // list (T71/T152) never needed it.
      supabase.from("one_off_items").select("id, name, amount, balance_id, due_date").not("balance_id", "is", null),
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

  // T212: `forecastData.recurringItems` (already fetched by loadForecast())
  // already has every income's name, so this needs no extra query - just a
  // join against income_auto_moves' bare income_id, grouped by which
  // account each rule actually lands in.
  const incomeNameById = new Map(forecastData.recurringItems.map((item) => [item.id, item.name]));
  const autoMovesByDestination = new Map<string, { incomeId: string; incomeName: string; amount: number }[]>();
  for (const row of autoMovesRes.data ?? []) {
    const list = autoMovesByDestination.get(row.destination_balance_id) ?? [];
    list.push({ incomeId: row.income_id, incomeName: incomeNameById.get(row.income_id) ?? "an income", amount: row.amount });
    autoMovesByDestination.set(row.destination_balance_id, list);
  }

  return (
    <BalancesClient
      balances={balances ?? []}
      connectedItems={connectedItems}
      transactionsByBalanceId={transactionsByBalanceId}
      lowestPointByBalanceId={lowestPointByBalanceId}
      autoMovesByDestination={autoMovesByDestination}
      currency={forecastData.currency}
      today={forecastData.today}
      recurringItems={forecastData.recurringItems}
      oneOffItems={(oneOffsRes.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        amount: row.amount,
        dueDate: row.due_date,
        balanceId: row.balance_id,
      }))}
    />
  );
}
