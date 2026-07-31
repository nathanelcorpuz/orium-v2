"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity, type ActivityEntityType } from "@/lib/activityLog";

// T175 (SPEC.md Phase 22): one shared action for temporarily switching any
// financial record off, instead of six near-identical copies across each
// page's own actions.ts. The six pages differ only in which table the row
// lives in, which is exactly the kind of difference that belongs in a lookup
// rather than in six files that then drift (see Bug #12).
//
// The table is resolved through this whitelist and never taken from form data
// directly - `kind` arrives from the client, so interpolating it into a query
// would let a crafted request point the update at any table. Ownership itself
// is still enforced by row-level security, the same way every other action
// here relies on it.
const TABLE_BY_KIND = {
  recurring: "recurring_items",
  one_off: "one_off_items",
  budget: "budgets",
} as const;

type RecordKind = keyof typeof TABLE_BY_KIND;

// Every page whose data a toggle can change. Cheaper to revalidate all of
// them than to reason per-kind about which surfaces a given record feeds:
// a disabled income also changes its linked budget's projections, so the
// blast radius is wider than the page the toggle was clicked on.
const AFFECTED_PATHS = [
  "/",
  "/forecast",
  "/bills",
  "/income",
  "/debt",
  "/savings",
  "/misc",
  "/budgets",
];

export async function toggleRecordActive(formData: FormData) {
  const kind = formData.get("kind") as RecordKind;
  const table = TABLE_BY_KIND[kind];
  if (!table) return;

  const id = formData.get("id") as string;
  if (!id) return;

  // The form submits the value it wants applied, not a "flip it" instruction,
  // so a double submit is idempotent rather than toggling twice.
  const active = formData.get("active") === "true";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // T162: only `recurring_items` carries `type` (bill/income/debt/savings) -
  // one_off_items and budgets are each a single, already-known kind. `.select()`
  // returns the updated row in the same round trip (Postgres RETURNING), same
  // trick the delete actions elsewhere in this app use to avoid an extra query.
  // Two separate literal `.select()` calls rather than one built from a
  // variable - Supabase's client parses the select string's shape at the type
  // level, which a runtime-computed string defeats.
  if (kind === "recurring") {
    const { data: updated } = await supabase
      .from(table)
      .update({ active })
      .eq("id", id)
      .select("name, type")
      .single();
    if (user && updated) {
      await logActivity(supabase, user.id, {
        action: active ? "toggle_on" : "toggle_off",
        entityType: updated.type as ActivityEntityType,
        entityName: updated.name,
      });
    }
  } else {
    const { data: updated } = await supabase.from(table).update({ active }).eq("id", id).select("name").single();
    if (user && updated) {
      await logActivity(supabase, user.id, {
        action: active ? "toggle_on" : "toggle_off",
        entityType: kind === "one_off" ? "misc" : "budget",
        entityName: updated.name,
      });
    }
  }

  for (const path of AFFECTED_PATHS) revalidatePath(path);
}
