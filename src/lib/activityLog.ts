import type { createClient } from "@/lib/supabase/server";

// T162 (SPEC.md Phase 20): one shared writer for the activity log
// (migration 0029), called from every mutating server action after its real
// write succeeds - the same "small helper called from many actions" shape
// T175's toggleRecordActive already established, rather than a Postgres
// trigger (see the migration's own comment for why).
export type ActivityAction = "create" | "update" | "delete" | "settle" | "toggle_on" | "toggle_off";
export type ActivityEntityType =
  | "account"
  | "bill"
  | "income"
  | "debt"
  | "savings"
  | "budget"
  | "budget_entry"
  | "budget_account"
  | "misc"
  | "reminder";

/**
 * Records one activity-log entry. Deliberately never *throws* or returns an
 * error the caller has to handle - the log is a diary of what happened, not
 * part of what the user asked for, so a logging failure (a transient
 * network blip, a not-yet-migrated database mid-deploy) must never turn a
 * successful create/edit/delete into a reported failure. Callers
 * fire-and-forget this; none of them await a meaningful return value.
 *
 * T226 (bug report 2026-08-02, "the updates doesnt update when i update
 * budget accounts in any way"): a *silent* swallow used to mean exactly
 * that - silent. The actual root cause (activity_log's own `entity_type`
 * CHECK constraint missing 'budget_account', migration 0048) went
 * undetected for a full session's worth of budget-account activity because
 * nothing, anywhere, ever surfaced the insert failing. Still never thrown
 * or surfaced to the user, but now at least visible in server logs
 * (`npm run dev`'s terminal, or Vercel's function logs in production) so a
 * future schema/constraint mismatch like this one is diagnosable the same
 * day instead of silently for an unknown length of time.
 */
export async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  entry: {
    action: ActivityAction;
    entityType: ActivityEntityType;
    entityName: string;
    detail?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("activity_log").insert({
    user_id: userId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_name: entry.entityName,
    detail: entry.detail ?? null,
  });
  if (error) {
    console.error("logActivity failed (Updates feed entry not recorded):", error.message, entry);
  }
}
