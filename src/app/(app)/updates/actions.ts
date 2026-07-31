"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// T163: stamps "now" as the user's watermark - every activity_log entry at
// or before this moment stops counting as unseen. Called once the Updates
// page has actually rendered the current feed (see UpdatesClient.tsx), not
// on every keystroke or render - this is a deliberate "I've looked" action,
// not passive tracking.
export async function markUpdatesSeen() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({ activity_log_seen_at: new Date().toISOString() })
    .eq("user_id", user.id);

  // Revalidates the layout (not just /updates) since the sidebar badge is
  // rendered in AppShell, one level up from this page.
  revalidatePath("/", "layout");
}

// T185: hides one entry from this user's own Updates view. Never touches
// `activity_log` itself - that table is deliberately append-only, even to
// its own owner (T162's own migration comment), so the underlying row
// survives for bug-hunting/audit purposes. Recorded instead in the
// insert-only `activity_log_dismissals` join table (migration 0034); no
// "un-hide" exists, so nothing here ever needs to delete a dismissal row.
export async function dismissUpdate(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("activity_log_dismissals").insert({ user_id: user.id, activity_log_id: id });
  revalidatePath("/updates");
}

// T187: marks one entry read without touching the rest of the feed -
// "Mark all as read" (markUpdatesSeen above) stays the bulk path via the
// existing watermark; this is the individual case, the same insert-only
// shape as dismissUpdate above (migration 0035's activity_log_reads).
export async function markUpdateRead(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("activity_log_reads").insert({ user_id: user.id, activity_log_id: id });
  revalidatePath("/updates");
  // The sidebar's unread badge (AppShell, T163) also needs to drop by one.
  revalidatePath("/", "layout");
}
