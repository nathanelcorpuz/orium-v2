"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import { wipeFinancialData } from "@/lib/wipeFinancialData";
import { logActivity } from "@/lib/activityLog";

export type SettingsActionState = { error: string | null; message?: string };

export async function updateProfile(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const name = (formData.get("name") as string).trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.auth.updateUser({ data: { name } });
  if (error) return { error: error.message };

  // T226 (user request 2026-08-02, "every single action... should have a
  // corresponding update log"): Settings had no activity logging at all
  // before this - added here and below, matching the "misc" catch-all
  // entityType every other non-financial-record event already uses
  // (scenario create/delete, T174).
  if (user) {
    await logActivity(supabase, user.id, { action: "update", entityType: "misc", entityName: "Profile" });
  }

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

  // User request 2026-08-03: daily "transactions due today" email - a
  // time-of-day plus an IANA timezone name, checked against by the
  // scheduled sender (src/app/api/cron/daily-notifications/route.ts).
  const emailNotificationsEnabled = formData.get("emailNotificationsEnabled") === "on";
  const notificationTime = formData.get("notificationTime") as string;
  const notificationTimezone = (formData.get("notificationTimezone") as string) || null;
  if (emailNotificationsEnabled && !notificationTime) {
    return { error: "Choose a time of day for notifications." };
  }
  if (emailNotificationsEnabled && !notificationTimezone) {
    return { error: "Choose a timezone for notifications." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("preferences")
    .update({
      currency,
      balance_ranges: ranges,
      balance_tier_labels: tierLabels,
      email_notifications_enabled: emailNotificationsEnabled,
      // Postgres `time` accepts "HH:MM" as-is; falls back to the existing
      // default only if the field was somehow left blank (input[type=time]
      // always submits a value once a defaultValue is set).
      notification_time: notificationTime || "08:00",
      notification_timezone: notificationTimezone,
    })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "misc",
    entityName: "Preferences",
    detail: `Currency: ${currency}`,
  });

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

  // Logged *after* the wipe, not before - wipeFinancialData clears
  // activity_log itself (by design, so a reset/restore doesn't leave real
  // history sitting next to fresh sample data), so a log written first
  // would just be wiped along with everything else.
  await logActivity(supabase, user.id, { action: "delete", entityType: "misc", entityName: "All data (reset)" });

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

  // Same reasoning as resetData above - logged after the wipe+reseed, not
  // before, since wipeFinancialData clears activity_log itself.
  await logActivity(supabase, user.id, { action: "create", entityType: "misc", entityName: "Sample data restored" });

  revalidatePath("/", "layout");
  return { error: null, message: "Sample data restored." };
}
