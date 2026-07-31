import { createClient } from "@/lib/supabase/server";
import { UpdatesClient } from "./UpdatesClient";

// T163: capped rather than paginated - a glanceable "what changed" feed, not
// a full audit trail (that's what a real T162 export/search view would be,
// not scoped here). 200 is comfortably more than a couple would generate
// between visits even on an active day.
const FEED_LIMIT = 200;

export type ActivityLogRow = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_name: string;
  detail: string | null;
};

export default async function UpdatesPage() {
  const supabase = await createClient();

  const [logRes, prefsRes] = await Promise.all([
    supabase
      .from("activity_log")
      .select("id, created_at, action, entity_type, entity_name, detail")
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT),
    supabase.from("preferences").select("activity_log_seen_at").single(),
  ]);

  if (logRes.error) {
    return <p className="p-8 text-red-600">Could not load updates: {logRes.error.message}</p>;
  }

  // Read once, before UpdatesClient marks it seen - this render's "new"
  // boundary has to be the watermark as it stood *before* this visit, or
  // every entry would immediately count as already-seen and nothing would
  // ever visibly highlight as new.
  const seenAt = prefsRes.data?.activity_log_seen_at ?? null;

  return <UpdatesClient entries={logRes.data ?? []} seenAt={seenAt} />;
}
