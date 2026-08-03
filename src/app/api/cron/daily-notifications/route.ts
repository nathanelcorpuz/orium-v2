import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDueTodayItems } from "@/lib/notifications/dueTodayForecast";
import { sendDueTodayEmail } from "@/lib/notifications/sendEmail";
import {
  isWithinNotificationWindow,
  localTimeInTimeZone,
  minutesSinceMidnight,
} from "@/lib/notifications/notificationTiming";

// User request 2026-08-03: "implement an email notification system that
// notifies me when a forecasted transaction is detected for the day... I
// should be able to set the time of when in the day I will receive it and
// it should ask for a timezone." Triggered by Vercel Cron every 15 minutes
// (vercel.json) - never by a browser, so it authenticates itself via a
// bearer secret rather than a user session (Vercel sends this
// automatically for every cron-triggered request once CRON_SECRET is set
// as an env var - see SPEC.md Operations for where to get/set it).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return new Response("Admin client unavailable - SUPABASE_SERVICE_ROLE_KEY not set", { status: 500 });
  }

  const { data: prefs, error } = await admin
    .from("preferences")
    .select("user_id, currency, notification_time, notification_timezone, last_notified_date")
    .eq("email_notifications_enabled", true);
  if (error) return new Response(error.message, { status: 500 });

  const now = new Date();
  let checked = 0;
  let sent = 0;
  const errors: string[] = [];

  for (const pref of prefs ?? []) {
    checked++;
    // Never configured a zone yet (enabled the toggle but somehow skipped
    // the select, or a pre-migration row) - nothing to compare against.
    if (!pref.notification_timezone) continue;

    const local = localTimeInTimeZone(now, pref.notification_timezone);
    // Already sent today, in *their* timezone - guards against firing twice
    // if two ticks land inside the same matching window.
    if (pref.last_notified_date === local.dateStr) continue;
    if (!isWithinNotificationWindow(local.minutesSinceMidnight, minutesSinceMidnight(pref.notification_time))) {
      continue;
    }

    const { data: userRes, error: userError } = await admin.auth.admin.getUserById(pref.user_id);
    const email = userRes?.user?.email;
    if (userError || !email) {
      errors.push(`${pref.user_id}: could not resolve an email address`);
      continue;
    }

    const items = await loadDueTodayItems(admin, pref.user_id, local.dateStr);

    if (items.length > 0) {
      const { error: sendError } = await sendDueTodayEmail(email, items, pref.currency ?? "₱", local.dateStr);
      if (sendError) {
        // Not marked as notified - left to retry on the next tick, still
        // inside the same matching window.
        errors.push(`${pref.user_id}: ${sendError}`);
        continue;
      }
      sent++;
    }
    // Marked as notified even on a quiet day (nothing due) - otherwise the
    // window would stay open and a later tick would just re-check for
    // nothing, repeatedly, for no benefit.
    await admin.from("preferences").update({ last_notified_date: local.dateStr }).eq("user_id", pref.user_id);
  }

  return NextResponse.json({ checked, sent, errors });
}
