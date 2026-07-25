"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ReminderActionState = { error: string | null };

export async function createReminder(
  _prevState: ReminderActionState,
  formData: FormData,
): Promise<ReminderActionState> {
  const text = (formData.get("text") as string).trim();
  if (!text) return { error: "Reminder text is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("reminders").insert({ user_id: user.id, text });
  if (error) return { error: error.message };

  revalidatePath("/forecast");
  return { error: null };
}

export async function updateReminder(
  _prevState: ReminderActionState,
  formData: FormData,
): Promise<ReminderActionState> {
  const id = formData.get("id") as string;
  const text = (formData.get("text") as string).trim();
  if (!text) return { error: "Reminder text is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("reminders").update({ text }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/forecast");
  return { error: null };
}

export async function deleteReminder(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("reminders").delete().eq("id", id);
  revalidatePath("/forecast");
}

// T84: marks a reminder complete (persists it, out of the default list) or
// restores it back to active - same action handles both directions via the
// "completed" hidden field, mirroring how deleteReminder is a plain (no
// useActionState) form action since there's no error state worth surfacing.
export async function setReminderCompleted(formData: FormData) {
  const id = formData.get("id") as string;
  const completed = formData.get("completed") === "true";
  const supabase = await createClient();
  await supabase
    .from("reminders")
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);
  revalidatePath("/forecast");
}
