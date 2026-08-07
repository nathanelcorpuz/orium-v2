import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ScenarioBudgetEntryRow } from "../ScenarioBudgetEntryModal";
import { ScenarioDetailClient } from "./ScenarioDetailClient";

// T174: a single scenario's own item list - separate from the /scenarios
// list page, which only manages the scenarios themselves (create/rename/
// delete/activate).
export default async function ScenarioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    scenarioRes,
    itemsRes,
    oneOffsRes,
    balancesRes,
    scenarioBudgetsRes,
    scenarioBudgetEntriesRes,
    realIncomesRes,
  ] = await Promise.all([
    supabase.from("scenarios").select("id, name").eq("id", id).single(),
    supabase
      .from("scenario_recurring_items")
      .select(
        "id, name, type, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments, balance_id",
      )
      .eq("scenario_id", id)
      .order("start_date", { ascending: true }),
    supabase
      .from("scenario_one_off_items")
      .select("id, name, amount, due_date, comments, balance_id")
      .eq("scenario_id", id)
      .order("due_date", { ascending: true }),
    supabase.from("balances").select("id, name").order("name", { ascending: true }),
    // T182, full parity added by T218 follow-up (2026-08-02); real-data
    // linking added by T223 (2026-08-02, same day).
    supabase
      .from("scenario_budgets")
      .select(
        "id, name, allocation, linked_income_id, linked_scenario_income_id, balance_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count",
      )
      .eq("scenario_id", id)
      .order("name", { ascending: true }),
    supabase
      .from("scenario_budget_entries")
      .select("id, scenario_budget_id, entry_date, amount, direction, note")
      .eq("scenario_id", id)
      .order("entry_date", { ascending: false }),
    // T223 (user request 2026-08-02): "all active income should be
    // available as options in the scenario budget" - every *real* income,
    // not just this scenario's own hypothetical ones.
    supabase
      .from("recurring_items")
      .select(
        "id, name, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, balance_id",
      )
      .eq("type", "income")
      .order("name", { ascending: true }),
  ]);

  // RLS already scopes this to the current user's own scenarios; a missing
  // row here means either a bad id or someone else's scenario, which reads
  // identically as "not found" either way - no information leak in telling
  // the two apart.
  if (scenarioRes.error || !scenarioRes.data) notFound();

  const entriesByBudgetId = new Map<string, ScenarioBudgetEntryRow[]>();
  for (const entry of scenarioBudgetEntriesRes.data ?? []) {
    const list = entriesByBudgetId.get(entry.scenario_budget_id) ?? [];
    list.push(entry);
    entriesByBudgetId.set(entry.scenario_budget_id, list);
  }

  // T218 follow-up: a scenario budget can only link to one of this same
  // scenario's own income items (migration 0046's own comment on why),
  // resolved here from the same `scenario_recurring_items` query above
  // rather than a second one.
  const scenarioIncomes = (itemsRes.data ?? [])
    .filter((item) => item.type === "income")
    .map((item) => ({
      id: item.id,
      name: item.name,
      startDate: item.start_date,
      interval: item.interval,
      unit: item.unit,
      weekdays: item.weekdays,
      daysOfMonth: item.days_of_month,
      ordinal: item.ordinal,
      ordinalWeekday: item.ordinal_weekday,
      endsType: item.ends_type,
      endDate: item.end_date,
      occurrenceCount: item.occurrence_count,
    }));

  // T223: same shape as scenarioIncomes above, just sourced from the real
  // `recurring_items` table instead.
  const realIncomes = (realIncomesRes.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    startDate: item.start_date,
    interval: item.interval,
    unit: item.unit,
    weekdays: item.weekdays,
    daysOfMonth: item.days_of_month,
    ordinal: item.ordinal,
    ordinalWeekday: item.ordinal_weekday,
    endsType: item.ends_type,
    endDate: item.end_date,
    occurrenceCount: item.occurrence_count,
    balanceId: item.balance_id,
  }));

  return (
    <ScenarioDetailClient
      scenario={scenarioRes.data}
      items={itemsRes.data ?? []}
      oneOffs={oneOffsRes.data ?? []}
      scenarioBudgets={scenarioBudgetsRes.data ?? []}
      scenarioIncomes={scenarioIncomes}
      realIncomes={realIncomes}
      entriesByBudgetId={entriesByBudgetId}
      balances={balancesRes.data ?? []}
    />
  );
}
