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

  const [scenarioRes, itemsRes, oneOffsRes, balancesRes, scenarioBudgetsRes, scenarioBudgetEntriesRes] =
    await Promise.all([
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
      // T182
      supabase.from("scenario_budgets").select("id, name").eq("scenario_id", id).order("name", { ascending: true }),
      supabase
        .from("scenario_budget_entries")
        .select("id, scenario_budget_id, entry_date, amount, direction, note")
        .eq("scenario_id", id)
        .order("entry_date", { ascending: false }),
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

  return (
    <ScenarioDetailClient
      scenario={scenarioRes.data}
      items={itemsRes.data ?? []}
      oneOffs={oneOffsRes.data ?? []}
      scenarioBudgets={scenarioBudgetsRes.data ?? []}
      entriesByBudgetId={entriesByBudgetId}
      balances={balancesRes.data ?? []}
    />
  );
}
