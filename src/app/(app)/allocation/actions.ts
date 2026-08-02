"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activityLog";

// Fund-distribution planning page (2026-08-03): moves a bill/debt/savings
// item or a Misc one-off to a different connected account (or to
// "Unassigned") straight from the account-allocation view, instead of
// requiring a trip to that item's own edit form. Mirrors accounts/actions.ts'
// `disconnectItem` shape - same two-table branch, same revalidate list -
// generalized from "always clear the link" to "set it to whatever the form
// submitted."
//
// `.eq("auto_debited", false)` on the recurring branch is a server-side
// guard matching the UI's own rule (T232): an auto-debited item never offers
// a reassign control, but this stops a stale/tampered request from moving
// one anyway - the update simply matches no row and silently no-ops.
export async function reassignConnectedItem(formData: FormData) {
  const sourceType = formData.get("sourceType") as "recurring" | "one_off";
  const id = formData.get("id") as string;
  const balanceId = (formData.get("balanceId") as string) || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const detail = balanceId ? "Reassigned to a different account" : "Unassigned from its account";

  if (sourceType === "recurring") {
    const { data: updated } = await supabase
      .from("recurring_items")
      .update({ balance_id: balanceId })
      .eq("id", id)
      .eq("auto_debited", false)
      .select("name, type")
      .single();
    if (user && updated) {
      await logActivity(supabase, user.id, {
        action: "update",
        entityType: updated.type as "bill" | "debt" | "savings",
        entityName: updated.name,
        detail,
      });
    }
  } else {
    const { data: updated } = await supabase
      .from("one_off_items")
      .update({ balance_id: balanceId })
      .eq("id", id)
      .select("name")
      .single();
    if (user && updated) {
      await logActivity(supabase, user.id, { action: "update", entityType: "misc", entityName: updated.name, detail });
    }
  }

  revalidatePath("/allocation");
  revalidatePath("/forecast");
  revalidatePath("/bills");
  revalidatePath("/debt");
  revalidatePath("/savings");
  revalidatePath("/misc");
  revalidatePath("/accounts");
  revalidatePath("/");
}
