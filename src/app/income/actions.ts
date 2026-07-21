"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import { readRecurrenceRuleForm } from "@/lib/recurrenceForm";
import { deleteStaleOverrides } from "@/lib/staleOverrides";

export type IncomeActionState = { error: string | null };

function readIncomeForm(formData: FormData) {
  const name = (formData.get("name") as string).trim();
  const amountPesos = parseCentavos(formData.get("amountPesos") as string);
  const startDate = formData.get("startDate") as string;
  const comments = ((formData.get("comments") as string) || "").trim() || null;

  if (!name) return { error: "Name is required." } as const;
  if (amountPesos === null || amountPesos === 0) {
    return { error: "Enter a valid amount." } as const;
  }
  if (!startDate) return { error: "Start date is required." } as const;

  const rule = readRecurrenceRuleForm(formData);
  if (rule.error !== null) return { error: rule.error };

  return {
    ...rule,
    name,
    amount: Math.abs(amountPesos),
    startDate,
    comments,
  } as const;
}

export async function createIncome(
  _prevState: IncomeActionState,
  formData: FormData,
): Promise<IncomeActionState> {
  const fields = readIncomeForm(formData);
  if (fields.error !== null) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("recurring_items").insert({
    user_id: user.id,
    name: fields.name,
    type: "income",
    amount: fields.amount,
    start_date: fields.startDate,
    interval: fields.interval,
    unit: fields.unit,
    weekdays: fields.weekdays,
    days_of_month: fields.daysOfMonth,
    ordinal: fields.ordinal,
    ordinal_weekday: fields.ordinalWeekday,
    ends_type: fields.endsType,
    end_date: fields.endDate,
    occurrence_count: fields.occurrenceCount,
    comments: fields.comments,
  });
  if (error) return { error: error.message };

  revalidatePath("/income");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function updateIncome(
  _prevState: IncomeActionState,
  formData: FormData,
): Promise<IncomeActionState> {
  const id = formData.get("id") as string;
  const fields = readIncomeForm(formData);
  if (fields.error !== null) return { error: fields.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_items")
    .update({
      name: fields.name,
      amount: fields.amount,
      start_date: fields.startDate,
      interval: fields.interval,
      unit: fields.unit,
      weekdays: fields.weekdays,
      days_of_month: fields.daysOfMonth,
      ordinal: fields.ordinal,
      ordinal_weekday: fields.ordinalWeekday,
      ends_type: fields.endsType,
      end_date: fields.endDate,
      occurrence_count: fields.occurrenceCount,
      comments: fields.comments,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await deleteStaleOverrides(supabase, id, {
    startDate: fields.startDate,
    interval: fields.interval,
    unit: fields.unit,
    weekdays: fields.weekdays,
    daysOfMonth: fields.daysOfMonth,
    ordinal: fields.ordinal,
    ordinalWeekday: fields.ordinalWeekday,
    endsType: fields.endsType,
    endDate: fields.endDate,
    occurrenceCount: fields.occurrenceCount,
  });

  revalidatePath("/income");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function deleteIncome(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("recurring_items").delete().eq("id", id);
  revalidatePath("/income");
  revalidatePath("/forecast");
  revalidatePath("/");
}
