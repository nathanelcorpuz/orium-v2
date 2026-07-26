"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import { wipeFinancialData } from "@/lib/wipeFinancialData";

export type SettingsActionState = { error: string | null; message?: string };

export async function updateProfile(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const name = (formData.get("name") as string).trim();

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { name } });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { error: null, message: "Profile saved." };
}

export async function updatePreferences(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const currency = (formData.get("currency") as string).trim();
  if (!currency) return { error: "Currency symbol is required." };
  if (currency.length > 5) return { error: "Currency symbol is too long." };

  const thresholdKeys = ["danger", "low", "medium", "high", "higher"];
  const ranges: number[] = [];
  for (const key of thresholdKeys) {
    const parsed = parseCentavos(formData.get(key) as string);
    if (parsed === null) return { error: `Enter a valid amount for "${key}".` };
    ranges.push(parsed);
  }
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i] < ranges[i - 1]) {
      return { error: "Each threshold must be greater than or equal to the one before it." };
    }
  }

  // T80: 6 tier labels (one more than the 5 thresholds above - "highest"
  // has no threshold of its own), in the same order balanceRangeTier/
  // TIER_ORDER (balanceColor.ts) uses.
  const tierKeys = ["danger", "low", "medium", "high", "higher", "highest"];
  const tierLabels: string[] = [];
  for (const key of tierKeys) {
    const value = (formData.get(`label_${key}`) as string).trim();
    if (!value) return { error: `Enter a label for "${key}".` };
    tierLabels.push(value);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("preferences")
    .update({ currency, balance_ranges: ranges, balance_tier_labels: tierLabels })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null, message: "Preferences saved." };
}

export async function deleteAccount(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const confirmation = formData.get("confirmation") as string;
  if (confirmation !== "DELETE") {
    return { error: 'Type "DELETE" to confirm.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const wipeError = await wipeFinancialData(supabase, user.id);
  if (wipeError) return { error: wipeError };

  const { error } = await supabase.from("preferences").delete().eq("user_id", user.id);
  if (error) return { error: error.message };

  await supabase.auth.signOut();
  redirect("/login");
}

// T97: wipes every financial/transactional table (same list as account
// deletion, minus `preferences`) but keeps the account itself and its
// display preferences intact - for a user who wants to clear out sample or
// test data and start entering their own, without losing currency/
// threshold settings or having to sign back in.
export async function resetData(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const confirmation = formData.get("confirmation") as string;
  if (confirmation !== "RESET") {
    return { error: 'Type "RESET" to confirm.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const wipeError = await wipeFinancialData(supabase, user.id);
  if (wipeError) return { error: wipeError };

  revalidatePath("/", "layout");
  return { error: null, message: "All data cleared. Your account and preferences are untouched." };
}

// T97: wipes first (same as resetData) then re-seeds the sample dataset via
// the `seed_sample_data` Postgres function (supabase/migrations/
// 0016_sample_data_seeding.sql) - always wipe-then-seed, never layered on
// top of existing data, so the account never ends up with a mix of sample
// and real entries the user didn't ask for (confirmed with the user
// 2026-07-25; the confirmation modal's copy is what carries the warning).
export async function restoreSampleData(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const confirmation = formData.get("confirmation") as string;
  if (confirmation !== "RESTORE") {
    return { error: 'Type "RESTORE" to confirm.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const wipeError = await wipeFinancialData(supabase, user.id);
  if (wipeError) return { error: wipeError };

  const { error: seedError } = await supabase.rpc("seed_sample_data", { target_user: user.id });
  if (seedError) return { error: seedError.message };

  const { error: stampError } = await supabase
    .from("preferences")
    .update({ sample_data_seeded_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (stampError) return { error: stampError.message };

  revalidatePath("/", "layout");
  return { error: null, message: "Sample data restored." };
}
