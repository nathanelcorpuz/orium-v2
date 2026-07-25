import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { findFirstDangerPoint, findLowestBalancePoint } from "@/lib/engine/lowestBalance";
import { getSampleFixtureData, SAMPLE_FIXTURE_REMINDERS } from "@/lib/sampleFixture";
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
  if (preview) {
    forecastData = getSampleFixtureData();
    reminders = SAMPLE_FIXTURE_REMINDERS;
  } else {
    const supabase = await createClient();
    const [data, remindersRes] = await Promise.all([
      loadForecast(),
      supabase.from("reminders").select("id, text, completed").order("created_at", { ascending: true }),
    ]);
    forecastData = data;
    reminders = remindersRes.data ?? [];
  }

  const { forecast, balances, currency, balanceRanges, tierLabels, sampleDataSeededAt, today } = forecastData;
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
      lowestBalance={lowestBalance}
      firstDanger={firstDanger}
      sampleDataSeededAt={sampleDataSeededAt}
      previewMode={preview}
    />
  );
}
