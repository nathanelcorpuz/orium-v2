import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import type { RecurringItemType } from "@/lib/engine/types";

export type RecurringItemActionState = { error: string | null };

function readMonthlyGoalForm(formData: FormData) {
  const name = (formData.get("name") as string).trim();
  const amountPesos = parseCentavos(formData.get("amountPesos") as string);
  const dayOfMonth = Number(formData.get("dayOfMonth"));
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const comments = ((formData.get("comments") as string) || "").trim() || null;

  if (!name) return { error: "Name is required." } as const;
  if (amountPesos === null || amountPesos === 0) {
    return { error: "Enter a valid amount." } as const;
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return { error: "Day of month must be between 1 and 31." } as const;
  }
  if (!startDate) return { error: "Start date is required." } as const;
  if (!endDate) return { error: "End date is required." } as const;
  if (startDate > endDate) return { error: "Start date must be before the end date." } as const;

  return {
    error: null,
    name,
    amount: -Math.abs(amountPesos),
    dayOfMonth,
    startDate,
    endDate,
    comments,
  } as const;
}

export async function createMonthlyGoal(
  type: RecurringItemType,
  path: string,
  formData: FormData,
): Promise<RecurringItemActionState> {
  const fields = readMonthlyGoalForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("recurring_items").insert({
    user_id: user.id,
    name: fields.name,
    type,
    amount: fields.amount,
    frequency: "monthly",
    day_of_month: fields.dayOfMonth,
    weekday: null,
    start_date: fields.startDate,
    end_date: fields.endDate,
    comments: fields.comments,
  });
  if (error) return { error: error.message };

  revalidatePath(path);
  revalidatePath("/");
  return { error: null };
}

export async function updateMonthlyGoal(
  path: string,
  formData: FormData,
): Promise<RecurringItemActionState> {
  const id = formData.get("id") as string;
  const fields = readMonthlyGoalForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_items")
    .update({
      name: fields.name,
      amount: fields.amount,
      day_of_month: fields.dayOfMonth,
      start_date: fields.startDate,
      end_date: fields.endDate,
      comments: fields.comments,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(path);
  revalidatePath("/");
  return { error: null };
}

export async function deleteMonthlyGoal(path: string, formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("recurring_items").delete().eq("id", id);
  revalidatePath(path);
  revalidatePath("/");
}
