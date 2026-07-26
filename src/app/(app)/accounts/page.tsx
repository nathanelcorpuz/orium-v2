import { createClient } from "@/lib/supabase/server";
import { getSampleFixtureData } from "@/lib/sampleFixture";
import { BalancesClient, type ConnectedItem } from "./BalancesClient";

export default async function BalancesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // T120: the short tour (T116/T119) now walks through this page, and a
  // brand-new account has nothing here to look at - so `?preview=1` renders
  // the same read-only sample fixture Dashboard/Forecast already use (T103),
  // purely as visual placeholders. Nothing is written, and every mutating
  // control is disabled while it's on.
  const preview = (await searchParams).preview === "1";
  if (preview) {
    const fixture = getSampleFixtureData();
    const previewConnected: ConnectedItem[] = fixture.recurringItems
      .filter((item) => item.balanceId !== null)
      .map((item) => ({
        id: item.id,
        name: item.name,
        amount: item.amount,
        balanceId: item.balanceId as string,
        sourceType: "recurring" as const,
        type: item.type,
      }));
    return (
      <BalancesClient balances={fixture.balances} connectedItems={previewConnected} previewMode />
    );
  }

  const supabase = await createClient();
  const [{ data: balances, error }, recurringRes, oneOffRes] = await Promise.all([
    supabase
      .from("balances")
      .select("id, name, amount, comments")
      .order("created_at", { ascending: true }),
    // T71: connected-items view - every recurring item (bill/income/debt/
    // savings) currently linked to any account.
    supabase
      .from("recurring_items")
      .select("id, name, type, amount, balance_id")
      .not("balance_id", "is", null),
    // T71: same, for extras (one-offs) - which have no `type` column since
    // they're all conceptually "extra".
    supabase.from("one_off_items").select("id, name, amount, balance_id").not("balance_id", "is", null),
  ]);

  if (error) {
    return <p className="p-8 text-red-600">Could not load balances: {error.message}</p>;
  }

  const connectedItems: ConnectedItem[] = [
    ...(recurringRes.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      balanceId: item.balance_id as string,
      sourceType: "recurring" as const,
      type: item.type,
    })),
    ...(oneOffRes.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      balanceId: item.balance_id as string,
      sourceType: "one_off" as const,
      type: "extra",
    })),
  ];

  return <BalancesClient balances={balances ?? []} connectedItems={connectedItems} />;
}
