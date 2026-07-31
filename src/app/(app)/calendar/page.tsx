import { createClient } from "@/lib/supabase/server";
import { loadForecast } from "@/lib/forecastData";
import { CalendarClient } from "./CalendarClient";

// T164 (SPEC.md Phase 20): a family calendar view built on the forecast -
// yellow for forecast transactions, green for reminders/todos, per the
// user's own request. No `?preview=1` support here, unlike most other pages
// - the 6-step guided tour (T120/T129) never visits this page, so preview
// mode isn't required for the tour to work, and adding it is a clean
// follow-up rather than something this page needs on day one.
export default async function CalendarPage() {
  const supabase = await createClient();

  const [forecastData, remindersRes] = await Promise.all([
    loadForecast(),
    supabase.from("reminders").select("id, text, completed").order("created_at", { ascending: true }),
  ]);

  const { forecast, balances, currency, today } = forecastData;
  const reminders = remindersRes.data ?? [];

  return <CalendarClient forecast={forecast} balances={balances} currency={currency} reminders={reminders} today={today} />;
}
