import { createClient } from "@/lib/supabase/server";
import { BalancesClient } from "./BalancesClient";

export default async function BalancesPage() {
  const supabase = await createClient();
  const { data: balances, error } = await supabase
    .from("balances")
    .select("id, name, amount, comments")
    .order("created_at", { ascending: true });

  if (error) {
    return <p className="p-8 text-red-600">Could not load balances: {error.message}</p>;
  }

  return <BalancesClient balances={balances ?? []} />;
}
