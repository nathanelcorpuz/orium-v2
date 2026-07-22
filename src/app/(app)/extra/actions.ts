"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";

export type ExtraActionState = { error: string | null };

function readExtraForm(formData: FormData) {
  const name = (formData.get("name") as string).trim();
  const magnitude = parseCentavos(formData.get("amountPesos") as string);
  const direction = formData.get("direction") as string;
  const dueDate = formData.get("dueDate") as string;
  const comments = ((formData.get("comments") as string) || "").trim() || null;

  if (!name) return { error: "Name is required." } as const;
  if (magnitude === null || magnitude === 0) {
    return { error: "Enter a valid amount." } as const;
  }
  if (direction !== "in" && direction !== "out") {
    return { error: "Choose money in or money out." } as const;
  }
  if (!dueDate) return { error: "Due date is required." } as const;

  return {
    error: null,
    name,
    amount: direction === "in" ? Math.abs(magnitude) : -Math.abs(magnitude),
    dueDate,
    comments,
  } as const;
}

export async function createExtra(
  _prevState: ExtraActionState,
  formData: FormData,
): Promise<ExtraActionState> {
  const fields = readExtraForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("one_off_items").insert({
    user_id: user.id,
    name: fields.name,
    amount: fields.amount,
    due_date: fields.dueDate,
    comments: fields.comments,
  });
  if (error) return { error: error.message };

  revalidatePath("/extra");
  revalidatePath("/");
  return { error: null };
}

export async function updateExtra(
  _prevState: ExtraActionState,
  formData: FormData,
): Promise<ExtraActionState> {
  const id = formData.get("id") as string;
  const fields = readExtraForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("one_off_items")
    .update({
      name: fields.name,
      amount: fields.amount,
      due_date: fields.dueDate,
      comments: fields.comments,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/extra");
  revalidatePath("/");
  return { error: null };
}

export async function deleteExtra(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("one_off_items").delete().eq("id", id);
  revalidatePath("/extra");
  revalidatePath("/");
}
