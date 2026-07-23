import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { findLowestBalancePoint } from "@/lib/engine/lowestBalance";
import { ForecastClient } from "./ForecastClient";

export default async function ForecastPage() {
  const supabase = await createClient();
  const [{ forecast, balances, currency, balanceRanges, today }, remindersRes] = await Promise.all([
    loadForecast(),
    supabase.from("reminders").select("id, text").order("created_at", { ascending: true }),
  ]);

  const totalBalance = balances.reduce((sum, balance) => sum + balance.amount, 0);
  const lowestBalance = findLowestBalancePoint(forecast, totalBalance, today);

  return (
    <ForecastClient
      forecast={forecast}
      balances={balances}
      currency={currency}
      balanceRanges={balanceRanges}
      reminders={remindersRes.data ?? []}
      lowestBalance={lowestBalance}
    />
  );
}
