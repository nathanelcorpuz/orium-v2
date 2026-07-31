import { createClient } from "@/lib/supabase/server";
import { ScenariosClient } from "./ScenariosClient";

// T174 ("run possible scenario"): the scenarios management page - create,
// rename, delete, toggle any number of them active (T183: each merged into
// Forecast/Dashboard independently, not just one at a time), and
// permanently activate one (copy its items into real data). Item management
// for a single scenario lives on its own /scenarios/[id] page, not here, to
// keep this list simple.
export default async function ScenariosPage() {
  const supabase = await createClient();

  const { data: scenarios, error } = await supabase
    .from("scenarios")
    .select("id, name, created_at, is_active")
    .order("created_at", { ascending: true });

  if (error) {
    return <p className="p-8 text-red-600">Could not load scenarios: {error.message}</p>;
  }

  return <ScenariosClient scenarios={scenarios ?? []} />;
}
