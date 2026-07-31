import { createClient } from "@/lib/supabase/server";
import { HistoryClient } from "./HistoryClient";

export default async function HistoryPage() {
  const supabase = await createClient();

  const [settlementsRes, preferencesRes] = await Promise.all([
    supabase
      .from("settlements")
      .select(
        "id, name, type, forecasted_amount, actual_amount, forecasted_date, actual_date, forecasted_balance",
      )
      .order("actual_date", { ascending: false }),
    supabase.from("preferences").select("currency").single(),
  ]);

  if (settlementsRes.error) {
    return <p className="p-8 text-red-600">Could not load history: {settlementsRes.error.message}</p>;
  }

  return (
    <HistoryClient rows={settlementsRes.data ?? []} currency={preferencesRes.data?.currency ?? "₱"} />
  );
}
