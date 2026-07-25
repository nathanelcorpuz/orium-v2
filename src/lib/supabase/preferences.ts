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

// T97: auto-seeds the sample dataset the very first time an account gets a
// real session - called from both `/auth/callback` (email-confirmed
// signups) and `login()`, same as `ensureUserPreferences` above, so it
// fires regardless of which path a user's first session comes through.
// Guarded by `preferences.sample_data_seeded_at` (not by "does this account
// currently have any data") so a deliberately-emptied account (Settings'
// "Reset my data") never gets silently reseeded on the next login - only
// the user's own explicit "Restore sample data" brings it back.
export async function ensureSampleDataSeeded(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: preferences } = await supabase
    .from("preferences")
    .select("sample_data_seeded_at")
    .eq("user_id", user.id)
    .single();
  if (!preferences || preferences.sample_data_seeded_at) return;

  const { error: seedError } = await supabase.rpc("seed_sample_data", { target_user: user.id });
  if (seedError) return;

  await supabase
    .from("preferences")
    .update({ sample_data_seeded_at: new Date().toISOString() })
    .eq("user_id", user.id);
}
