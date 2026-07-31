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
