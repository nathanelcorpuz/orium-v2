import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { findFirstDangerPoint, findLowestBalancePoint, findNextTransactionBatch } from "@/lib/engine/lowestBalance";
import { splitPastDue } from "@/lib/engine/forecast";
import { getSampleFixtureData, SAMPLE_FIXTURE_REMINDERS } from "@/lib/sampleFixture";
import { connectedItemsFromFixture, type ConnectedItem } from "@/lib/connectedItems";
import { loadConnectedItems } from "@/lib/connectedItemsData";
import { ForecastClient } from "./ForecastClient";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // T103: opt-in preview mode (?preview=1) - same fixture Dashboard's page.tsx
  // uses, so both pages tell the same sample-family story. See
  // sampleFixture.ts for why this never touches Supabase.
  const preview = (await searchParams).preview === "1";

  let forecastData;
  let reminders;
  // T152 (Bug #12): the balance chips below open the Balances page's own
  // `BalanceModal`, so this page has to supply the same connected-items data
  // that page does - without it the modal silently renders no connections.
  let connectedItems: ConnectedItem[];
  // T183: every saved scenario (not just the active ones) - the Forecast
  // page's new "Scenarios" panel lists all of them, each with its own
  // independent toggle.
  let allScenarios: { id: string; name: string; is_active: boolean }[];
  if (preview) {
    forecastData = getSampleFixtureData();
    reminders = SAMPLE_FIXTURE_REMINDERS;
    connectedItems = connectedItemsFromFixture(forecastData.recurringItems);
    allScenarios = [];
  } else {
    const supabase = await createClient();
    const [data, remindersRes, connected, scenariosRes] = await Promise.all([
      loadForecast(),
      supabase.from("reminders").select("id, text, completed, due_date").order("created_at", { ascending: true }),
      loadConnectedItems(),
      supabase.from("scenarios").select("id, name, is_active").order("created_at", { ascending: true }),
    ]);
    forecastData = data;
    reminders = remindersRes.data ?? [];
    connectedItems = connected;
    allScenarios = scenariosRes.data ?? [];
  }

  const {
    forecast,
    balances,
    recurringItems,
    budgets,
    budgetEntries,
    budgetBalanceLinks,
    incomeAutoMoves,
    incomeAutoMoveOverrides,
    currency,
    balanceRanges,
    tierLabels,
    today,
  } = forecastData;
  const totalBalance = balances.reduce((sum, balance) => sum + balance.amount, 0);
  // T150 (Bug #11): "lowest balance ahead" and "first hits danger" are both
  // forward-looking, so they read the upcoming rows only - but from a balance
  // that already has the past-due backlog taken off it. `balanceAfterPastDue`
  // is exactly `totalBalance` when nothing is overdue, so this is a no-op for
  // an up-to-date account.
  const { pastDueTotal, balanceAfterPastDue, pastDue, upcoming } = splitPastDue(forecast, totalBalance);
  const lowestBalance = findLowestBalancePoint(upcoming, balanceAfterPastDue, today);
  const firstDanger = findFirstDangerPoint(upcoming, balanceAfterPastDue, balanceRanges[0], today);
  // T215 (user request 2026-08-01): "days until next transaction(s) to
  // settle" - same `upcoming` rows the two stats above already use.
  const nextTransactionBatch = findNextTransactionBatch(upcoming);

  return (
    <ForecastClient
      forecast={forecast}
      balances={balances}
      recurringItems={recurringItems}
      budgets={budgets}
      budgetEntries={budgetEntries}
      budgetBalanceLinks={budgetBalanceLinks}
      currency={currency}
      balanceRanges={balanceRanges}
      tierLabels={tierLabels}
      reminders={reminders}
      connectedItems={connectedItems}
      pastDueCount={pastDue.length}
      pastDueTotal={pastDueTotal}
      balanceAfterPastDue={balanceAfterPastDue}
      lowestBalance={lowestBalance}
      firstDanger={firstDanger}
      nextTransactionBatch={nextTransactionBatch}
      previewMode={preview}
      allScenarios={allScenarios}
      incomeAutoMoves={incomeAutoMoves}
      incomeAutoMoveOverrides={incomeAutoMoveOverrides}
    />
  );
}
