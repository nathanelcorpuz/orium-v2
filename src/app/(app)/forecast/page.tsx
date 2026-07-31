import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { findFirstDangerPoint, findLowestBalancePoint } from "@/lib/engine/lowestBalance";
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

  const { forecast, balances, currency, balanceRanges, tierLabels, today } = forecastData;
  const totalBalance = balances.reduce((sum, balance) => sum + balance.amount, 0);
  const lowestBalance = findLowestBalancePoint(forecast, totalBalance, today);
  const firstDanger = findFirstDangerPoint(forecast, totalBalance, balanceRanges[0], today);

  return (
    <ForecastClient
      forecast={forecast}
      balances={balances}
      currency={currency}
      balanceRanges={balanceRanges}
      tierLabels={tierLabels}
      reminders={reminders}
      connectedItems={connectedItems}
      lowestBalance={lowestBalance}
      firstDanger={firstDanger}
      previewMode={preview}
    />
  );
}
