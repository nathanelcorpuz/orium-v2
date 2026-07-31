import { createClient } from "@/lib/supabase/server";
import { ScenariosClient } from "./ScenariosClient";

// T174 ("run possible scenario"): the scenarios management page - create,
// rename, delete, toggle which one is active (merged into Forecast/
// Dashboard), and permanently activate one (copy its items into real data).
// Item management for a single scenario lives on its own /scenarios/[id]
// page, not here, to keep this list simple.
export default async function ScenariosPage() {
  const supabase = await createClient();

  const [scenariosRes, prefsRes] = await Promise.all([
    supabase.from("scenarios").select("id, name, created_at").order("created_at", { ascending: true }),
    supabase.from("preferences").select("active_scenario_id").single(),
  ]);

  if (scenariosRes.error) {
    return <p className="p-8 text-red-600">Could not load scenarios: {scenariosRes.error.message}</p>;
  }

  return (
    <ScenariosClient
      scenarios={scenariosRes.data ?? []}
      activeScenarioId={prefsRes.data?.active_scenario_id ?? null}
    />
  );
}
