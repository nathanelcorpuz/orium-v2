import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureUserPreferences(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
}
