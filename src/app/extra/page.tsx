import { createClient } from "@/lib/supabase/server";
import { ExtraClient } from "./ExtraClient";

export default async function ExtraPage() {
  const supabase = await createClient();
  const { data: extras, error } = await supabase
    .from("one_off_items")
    .select("id, name, amount, due_date, comments")
    .order("due_date", { ascending: true });

  if (error) {
    return <p className="p-8 text-red-600">Could not load extras: {error.message}</p>;
  }

  return <ExtraClient extras={extras ?? []} />;
}
