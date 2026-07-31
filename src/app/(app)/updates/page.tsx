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

  const [logRes, prefsRes, dismissalsRes, readsRes] = await Promise.all([
    supabase
      .from("activity_log")
      .select("id, created_at, action, entity_type, entity_name, detail")
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT),
    supabase.from("preferences").select("activity_log_seen_at").single(),
    // T185: dismissed entries are filtered out here, server-side, so a
    // hidden row is never even sent to the client rather than hidden by CSS.
    supabase.from("activity_log_dismissals").select("activity_log_id"),
    // T187: individually-marked-read entries, so an entry read before "Mark
    // all as read" is ever clicked stops showing as new on this and every
    // later visit, not just until the next reload.
    supabase.from("activity_log_reads").select("activity_log_id"),
  ]);

  if (logRes.error) {
    return <p className="p-8 text-red-600">Could not load updates: {logRes.error.message}</p>;
  }

  // T187: no longer "read once before this visit auto-marks it seen" (T163's
  // old behavior) - the watermark now only ever moves via an explicit "Mark
  // all as read" click, so reading it here has no special ordering concern
  // anymore.
  const seenAt = prefsRes.data?.activity_log_seen_at ?? null;
  const dismissedIds = new Set((dismissalsRes.data ?? []).map((row) => row.activity_log_id));
  const readIds = new Set((readsRes.data ?? []).map((row) => row.activity_log_id));
  const entries = (logRes.data ?? []).filter((entry) => !dismissedIds.has(entry.id));

  return <UpdatesClient entries={entries} seenAt={seenAt} readIds={readIds} />;
}
