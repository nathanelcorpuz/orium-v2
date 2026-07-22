import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { ForecastClient } from "./ForecastClient";

export default async function ForecastPage() {
  const supabase = await createClient();
  const [
    { forecast, balances, currency, balanceRanges, recurringItems, overrides, budgets, budgetEntries, today },
    remindersRes,
  ] = await Promise.all([
    loadForecast(),
    supabase.from("reminders").select("id, text").order("created_at", { ascending: true }),
  ]);

  return (
    <ForecastClient
      forecast={forecast}
      balances={balances}
      currency={currency}
      balanceRanges={balanceRanges}
      recurringItems={recurringItems}
      overrides={overrides}
      budgets={budgets}
      budgetEntries={budgetEntries}
      today={today}
      reminders={remindersRes.data ?? []}
    />
  );
}
