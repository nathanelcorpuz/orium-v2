"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import { logActivity } from "@/lib/activityLog";

export type BalanceActionState = { error: string | null };

// T172: the fee field is optional - a blank input means "no fee" (0), not
// an error, unlike every other amount field in this app (which reads a
// blank as invalid via parseCentavos returning null). A negative value is
// still rejected, matching the DB's own `>= 0` check constraint.
function readTransactionFeeForm(formData: FormData): { error: string | null; fee: number } {
  const raw = ((formData.get("transactionFeePesos") as string) || "").trim();
  if (raw === "") return { error: null, fee: 0 };

  const parsed = parseCentavos(raw);
  if (parsed === null || parsed < 0) return { error: "Enter a valid transaction fee, or leave it blank.", fee: 0 };
  return { error: null, fee: parsed };
}

export async function createBalance(
  _prevState: BalanceActionState,
  formData: FormData,
): Promise<BalanceActionState> {
  const name = (formData.get("name") as string).trim();
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const comments = ((formData.get("comments") as string) || "").trim() || null;
  const feeFields = readTransactionFeeForm(formData);

  if (!name) return { error: "Name is required." };
  if (amount === null) return { error: "Enter a valid amount." };
  if (feeFields.error) return { error: feeFields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("balances").insert({
    user_id: user.id,
    name,
    amount,
    comments,
    transaction_fee_centavos: feeFields.fee,
  });
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, { action: "create", entityType: "account", entityName: name });

  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function updateBalance(
  _prevState: BalanceActionState,
  formData: FormData,
): Promise<BalanceActionState> {
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string).trim();
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const comments = ((formData.get("comments") as string) || "").trim() || null;
  const feeFields = readTransactionFeeForm(formData);

  if (!name) return { error: "Name is required." };
  if (amount === null) return { error: "Enter a valid amount." };
  if (feeFields.error) return { error: feeFields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("balances")
    .update({ name, amount, comments, transaction_fee_centavos: feeFields.fee })
    .eq("id", id);
  if (error) return { error: error.message };

  if (user) await logActivity(supabase, user.id, { action: "update", entityType: "account", entityName: name });

  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function deleteBalance(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // .select() returns the deleted row in the same round trip (Postgres
  // RETURNING) - the plain-void delete actions across this app never fetched
  // a row first, so this is the cheapest way to get the name for the log
  // without a separate query.
  const { data: deleted } = await supabase.from("balances").delete().eq("id", id).select("name").single();
  if (user && deleted) {
    await logActivity(supabase, user.id, { action: "delete", entityType: "account", entityName: deleted.name });
  }
  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/");
}

// T71 (SPEC.md Phase 12): unlinks one connected item from its account,
// setting the item back to "no connected account" - the item itself is
// otherwise untouched. Revalidates every category page since a recurring
// item could be a bill/income/debt/savings and this action isn't told
// which.
export async function disconnectItem(formData: FormData) {
  const sourceType = formData.get("sourceType") as "recurring" | "one_off";
  const id = formData.get("id") as string;
  const table = sourceType === "recurring" ? "recurring_items" : "one_off_items";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Two literal `.select()` calls rather than one built from a variable -
  // Supabase's client parses the select string's shape at the type level,
  // which a runtime-computed string defeats (same reason toggleActive.ts
  // branches the same way).
  if (sourceType === "recurring") {
    const { data: updated } = await supabase
      .from(table)
      .update({ balance_id: null })
      .eq("id", id)
      .select("name, type")
      .single();
    if (user && updated) {
      await logActivity(supabase, user.id, {
        action: "update",
        entityType: updated.type as "bill" | "income" | "debt" | "savings",
        entityName: updated.name,
        detail: "Disconnected from its account",
      });
    }
  } else {
    const { data: updated } = await supabase
      .from(table)
      .update({ balance_id: null })
      .eq("id", id)
      .select("name")
      .single();
    if (user && updated) {
      await logActivity(supabase, user.id, {
        action: "update",
        entityType: "misc",
        entityName: updated.name,
        detail: "Disconnected from its account",
      });
    }
  }

  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/bills");
  revalidatePath("/income");
  revalidatePath("/debt");
  revalidatePath("/savings");
  revalidatePath("/misc");
  revalidatePath("/");
}
