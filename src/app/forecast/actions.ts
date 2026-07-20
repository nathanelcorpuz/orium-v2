"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";

export type ForecastActionState = { error: string | null };

function readOccurrenceForm(formData: FormData) {
  const name = (formData.get("name") as string).trim();
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const date = formData.get("date") as string;

  if (!name) return { error: "Name is required." } as const;
  if (amount === null) return { error: "Enter a valid amount." } as const;
  if (!date) return { error: "Date is required." } as const;

  return { error: null, name, amount, date } as const;
}

export async function editRecurringOccurrence(
  _prevState: ForecastActionState,
  formData: FormData,
): Promise<ForecastActionState> {
  const recurringItemId = formData.get("sourceId") as string;
  const originalDate = formData.get("originalDate") as string;
  const fields = readOccurrenceForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("occurrence_overrides").upsert(
    {
      user_id: user.id,
      recurring_item_id: recurringItemId,
      original_date: originalDate,
      new_date: fields.date,
      new_amount: fields.amount,
      new_name: fields.name,
      skipped: false,
    },
    { onConflict: "recurring_item_id,original_date" },
  );
  if (error) return { error: error.message };

  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function editOneOff(
  _prevState: ForecastActionState,
  formData: FormData,
): Promise<ForecastActionState> {
  const id = formData.get("sourceId") as string;
  const fields = readOccurrenceForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("one_off_items")
    .update({ name: fields.name, amount: fields.amount, due_date: fields.date })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/forecast");
  revalidatePath("/");
  revalidatePath("/extra");
  return { error: null };
}

function readSettleForm(formData: FormData) {
  const actualAmount = parseCentavos(formData.get("actualAmountPesos") as string);
  const actualDate = formData.get("actualDate") as string;

  if (actualAmount === null) return { error: "Enter a valid actual amount." } as const;
  if (!actualDate) return { error: "Actual date is required." } as const;

  return { error: null, actualAmount, actualDate } as const;
}

export async function settleOccurrence(
  _prevState: ForecastActionState,
  formData: FormData,
): Promise<ForecastActionState> {
  const sourceType = formData.get("sourceType") as "recurring" | "one_off";
  const sourceId = formData.get("sourceId") as string;
  const originalDate = formData.get("originalDate") as string;
  const name = formData.get("name") as string;
  const type = formData.get("type") as string;
  const forecastedAmount = Number(formData.get("forecastedAmount"));
  const forecastedDate = formData.get("forecastedDate") as string;
  const forecastedBalance = Number(formData.get("forecastedBalance"));

  const fields = readSettleForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error: settlementError } = await supabase.from("settlements").insert({
    user_id: user.id,
    source_type: sourceType,
    source_id: sourceId,
    name,
    type,
    forecasted_amount: forecastedAmount,
    actual_amount: fields.actualAmount,
    forecasted_date: forecastedDate,
    actual_date: fields.actualDate,
    forecasted_balance: forecastedBalance,
  });
  if (settlementError) return { error: settlementError.message };

  if (sourceType === "recurring") {
    const { error } = await supabase.from("occurrence_overrides").upsert(
      {
        user_id: user.id,
        recurring_item_id: sourceId,
        original_date: originalDate,
        new_date: null,
        new_amount: null,
        new_name: null,
        skipped: true,
      },
      { onConflict: "recurring_item_id,original_date" },
    );
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("one_off_items").delete().eq("id", sourceId);
    if (error) return { error: error.message };
    revalidatePath("/extra");
  }

  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}
