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
 * Records one activity-log entry. Deliberately swallows its own errors -
 * the log is a diary of what happened, not part of what the user asked for,
 * so a logging failure (a transient network blip, a not-yet-migrated
 * database mid-deploy) must never turn a successful create/edit/delete into
 * a reported failure. Callers fire-and-forget this; none of them await a
 * meaningful return value.
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
  try {
    await supabase.from("activity_log").insert({
      user_id: userId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_name: entry.entityName,
      detail: entry.detail ?? null,
    });
  } catch {
    // See the doc comment above - intentionally silent.
  }
}
