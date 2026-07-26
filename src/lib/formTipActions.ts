"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// T120 follow-up: "don't show this tip next time" for a single form
// explainer (see FormTip.tsx). Appends rather than replaces, so two tips
// dismissed in quick succession can't clobber each other.
export async function dismissFormTip(tipKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: prefs } = await supabase
    .from("preferences")
    .select("dismissed_form_tips")
    .eq("user_id", user.id)
    .single();

  const current: string[] = prefs?.dismissed_form_tips ?? [];
  if (current.includes(tipKey)) return;

  await supabase
    .from("preferences")
    .update({ dismissed_form_tips: [...current, tipKey] })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
}

// Settings > Help counterpart, so a dismissal is never a one-way door.
export async function restoreFormTips() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({ dismissed_form_tips: [] })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
}
