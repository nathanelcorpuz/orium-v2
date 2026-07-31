import { createClient } from "@/lib/supabase/server";
import { idSetFromColumn } from "@/lib/editedItems";
import { getSampleFixtureData } from "@/lib/sampleFixture";
import type { BillRow } from "./BillModal";
import { BillsClient } from "./BillsClient";

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // T120: same read-only `?preview=1` placeholder treatment the Accounts
  // page now has - the short tour walks through here too, and a brand-new
  // account's Bills page is otherwise empty. The engine-shaped fixture items
  // are mapped to this page's DB row shape (camelCase -> snake_case); every
  // mutating control is disabled while preview is on.
  const preview = (await searchParams).preview === "1";
  if (preview) {
    const fixture = getSampleFixtureData();
    const previewBills: BillRow[] = fixture.recurringItems
      .filter((item) => item.type === "bill")
      .map((item) => ({
        id: item.id,
        name: item.name,
        amount: item.amount,
        start_date: item.startDate,
        interval: item.interval,
        unit: item.unit,
        weekdays: item.weekdays,
        days_of_month: item.daysOfMonth,
        ordinal: item.ordinal,
        ordinal_weekday: item.ordinalWeekday,
        ends_type: item.endsType,
        end_date: item.endDate,
        occurrence_count: item.occurrenceCount,
        comments: null,
        balance_id: item.balanceId,
      }));
    return (
      <BillsClient
        bills={previewBills}
        editedIds={new Set()}
        balances={fixture.balances.map((b) => ({ id: b.id, name: b.name }))}
        previewMode
      />
    );
  }

  const supabase = await createClient();
  const [{ data: bills, error }, overridesRes, balancesRes] = await Promise.all([
    supabase
      .from("recurring_items")
      .select(
        "id, name, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments, balance_id, active",
      )
      .eq("type", "bill")
      .order("start_date", { ascending: true }),
    // T51: any occurrence_overrides row (including a pure skip) marks the
    // item itself as edited, not just its individual Forecast occurrences.
    supabase.from("occurrence_overrides").select("recurring_item_id"),
    // T71: options for the optional "connected account" dropdown.
    supabase.from("balances").select("id, name").order("name", { ascending: true }),
  ]);

  if (error) {
    return <p className="p-8 text-red-600">Could not load bills: {error.message}</p>;
  }

  const editedIds = idSetFromColumn(overridesRes.data, "recurring_item_id");

  return <BillsClient bills={bills ?? []} editedIds={editedIds} balances={balancesRes.data ?? []} />;
}
