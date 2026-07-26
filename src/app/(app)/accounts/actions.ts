"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";

export type BalanceActionState = { error: string | null };

export async function createBalance(
  _prevState: BalanceActionState,
  formData: FormData,
): Promise<BalanceActionState> {
  const name = (formData.get("name") as string).trim();
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const comments = ((formData.get("comments") as string) || "").trim() || null;

  if (!name) return { error: "Name is required." };
  if (amount === null) return { error: "Enter a valid amount." };

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
  });
  if (error) return { error: error.message };

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

  if (!name) return { error: "Name is required." };
  if (amount === null) return { error: "Enter a valid amount." };

  const supabase = await createClient();
  const { error } = await supabase.from("balances").update({ name, amount, comments }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function deleteBalance(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("balances").delete().eq("id", id);
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
  await supabase.from(table).update({ balance_id: null }).eq("id", id);

  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/bills");
  revalidatePath("/income");
  revalidatePath("/debt");
  revalidatePath("/savings");
  revalidatePath("/misc");
  revalidatePath("/");
}
