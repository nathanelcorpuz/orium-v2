"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import type { RecurringFrequency } from "@/lib/engine/types";

export type IncomeActionState = { error: string | null };

const FREQUENCIES: RecurringFrequency[] = ["monthly", "weekly", "biweekly", "semi_monthly_15_30"];

function readIncomeForm(formData: FormData) {
  const name = (formData.get("name") as string).trim();
  const amountPesos = parseCentavos(formData.get("amountPesos") as string);
  const frequency = formData.get("frequency") as RecurringFrequency;
  const endDate = formData.get("endDate") as string;
  const comments = ((formData.get("comments") as string) || "").trim() || null;

  if (!name) return { error: "Name is required." } as const;
  if (amountPesos === null || amountPesos === 0) {
    return { error: "Enter a valid amount." } as const;
  }
  if (!FREQUENCIES.includes(frequency)) return { error: "Choose a frequency." } as const;
  if (!endDate) return { error: "Track-until date is required." } as const;

  let dayOfMonth: number | null = null;
  let startDate: string;

  if (frequency === "weekly" || frequency === "biweekly") {
    startDate = formData.get("startDate") as string;
    if (!startDate) return { error: "First payday date is required." } as const;
  } else {
    startDate = todayInManila();
    if (frequency === "monthly") {
      dayOfMonth = Number(formData.get("dayOfMonth"));
      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
        return { error: "Day of month must be between 1 and 31." } as const;
      }
    }
  }

  return {
    error: null,
    name,
    amount: Math.abs(amountPesos),
    frequency,
    dayOfMonth,
    startDate,
    endDate,
    comments,
  } as const;
}

export async function createIncome(
  _prevState: IncomeActionState,
  formData: FormData,
): Promise<IncomeActionState> {
  const fields = readIncomeForm(formData);
  if (fields.error) return { error: fields.error };

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
    frequency: fields.frequency,
    day_of_month: fields.dayOfMonth,
    weekday: null,
    start_date: fields.startDate,
    end_date: fields.endDate,
    comments: fields.comments,
  });
  if (error) return { error: error.message };

  revalidatePath("/income");
  return { error: null };
}

export async function updateIncome(
  _prevState: IncomeActionState,
  formData: FormData,
): Promise<IncomeActionState> {
  const id = formData.get("id") as string;
  const fields = readIncomeForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_items")
    .update({
      name: fields.name,
      amount: fields.amount,
      frequency: fields.frequency,
      day_of_month: fields.dayOfMonth,
      start_date: fields.startDate,
      end_date: fields.endDate,
      comments: fields.comments,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/income");
  return { error: null };
}

export async function deleteIncome(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("recurring_items").delete().eq("id", id);
  revalidatePath("/income");
}
