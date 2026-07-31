import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { findFirstDangerPoint, findLowestBalancePoint } from "@/lib/engine/lowestBalance";
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
  if (preview) {
    forecastData = getSampleFixtureData();
    reminders = SAMPLE_FIXTURE_REMINDERS;
    connectedItems = connectedItemsFromFixture(forecastData.recurringItems);
  } else {
    const supabase = await createClient();
    const [data, remindersRes, connected] = await Promise.all([
      loadForecast(),
      supabase.from("reminders").select("id, text, completed").order("created_at", { ascending: true }),
      loadConnectedItems(),
    ]);
    forecastData = data;
    reminders = remindersRes.data ?? [];
    connectedItems = connected;
  }

  const { forecast, balances, currency, balanceRanges, tierLabels, today, activeScenarioName } = forecastData;
  const totalBalance = balances.reduce((sum, balance) => sum + balance.amount, 0);
  // T150 (Bug #11): "lowest balance ahead" and "first hits danger" are both
  // forward-looking, so they read the upcoming rows only - but from a balance
  // that already has the past-due backlog taken off it. `balanceAfterPastDue`
  // is exactly `totalBalance` when nothing is overdue, so this is a no-op for
  // an up-to-date account.
  const { pastDueTotal, balanceAfterPastDue, pastDue, upcoming } = splitPastDue(forecast, totalBalance);
  const lowestBalance = findLowestBalancePoint(upcoming, balanceAfterPastDue, today);
  const firstDanger = findFirstDangerPoint(upcoming, balanceAfterPastDue, balanceRanges[0], today);

  return (
    <ForecastClient
      forecast={forecast}
      balances={balances}
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
      previewMode={preview}
      activeScenarioName={activeScenarioName}
    />
  );
}
