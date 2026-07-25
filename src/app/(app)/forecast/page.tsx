import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { findFirstDangerPoint, findLowestBalancePoint } from "@/lib/engine/lowestBalance";
import { ForecastClient } from "./ForecastClient";

export default async function ForecastPage() {
  const supabase = await createClient();
  const [{ forecast, balances, currency, balanceRanges, tierLabels, today }, remindersRes] = await Promise.all([
    loadForecast(),
    supabase.from("reminders").select("id, text, completed").order("created_at", { ascending: true }),
  ]);

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
      reminders={remindersRes.data ?? []}
      lowestBalance={lowestBalance}
      firstDanger={firstDanger}
    />
  );
}
