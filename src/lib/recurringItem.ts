import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import type { RecurringItemType } from "@/lib/engine/types";
import { readRecurrenceRuleForm } from "@/lib/recurrenceForm";
import { deleteStaleOverrides } from "@/lib/staleOverrides";
import { logActivity, type ActivityEntityType } from "@/lib/activityLog";

// createMonthlyGoal already receives `type` ("debt" | "savings"), which
// doubles as the ActivityEntityType. update/delete only receive `path`
// ("/debt" or "/savings") - deriving the same value from that rather than
// adding a redundant parameter to both call sites in debt/actions.ts and
// savings/actions.ts.
function entityTypeFromPath(path: string): ActivityEntityType {
  return path === "/savings" ? "savings" : "debt";
}

export type RecurringItemActionState = { error: string | null };

function readMonthlyGoalForm(formData: FormData, isCreate: boolean) {
  const name = (formData.get("name") as string).trim();
  const amountPesos = parseCentavos(formData.get("amountPesos") as string);
  const startDate = formData.get("startDate") as string;
  const comments = ((formData.get("comments") as string) || "").trim() || null;
  const balanceId = (formData.get("balanceId") as string) || null;

  if (!name) return { error: "Name is required." } as const;
  // T192 (user request): 0 is a valid amount. Only an unparseable value is
  // rejected.
  if (amountPesos === null) {
    return { error: "Enter a valid amount." } as const;
  }
  if (!startDate) return { error: "Start date is required." } as const;

  // T107: only a brand-new debt/savings item can't start in the past.
  const rule = readRecurrenceRuleForm(formData, { enforceFutureStart: isCreate });
  if (rule.error !== null) return { error: rule.error };
  // T72: createMonthlyGoal/updateMonthlyGoal (below) are only ever used by
  // Debt and Savings, which must always have a finite end (DB-enforced,
  // migration 0013) so their occurrence count is computable
  // (goalProgress.ts). Other recurring types keep "Never" (T85) - the
  // shared readRecurrenceRuleForm above allows it - so this rejection is
  // scoped to just these two callers, not centralized there.
  if (rule.endsType === "never") {
    return { error: "Choose an end date or a fixed number of occurrences." } as const;
  }

  return {
    ...rule,
    name,
    amount: -Math.abs(amountPesos),
    startDate,
    comments,
    balanceId,
  } as const;
}

export async function createMonthlyGoal(
  type: RecurringItemType,
  path: string,
  formData: FormData,
): Promise<RecurringItemActionState> {
  const fields = readMonthlyGoalForm(formData, true);
  if (fields.error !== null) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("recurring_items").insert({
    user_id: user.id,
    name: fields.name,
    type,
    amount: fields.amount,
    start_date: fields.startDate,
    interval: fields.interval,
    unit: fields.unit,
    weekdays: fields.weekdays,
    days_of_month: fields.daysOfMonth,
    ordinal: fields.ordinal,
    ordinal_weekday: fields.ordinalWeekday,
    ends_type: fields.endsType,
    end_date: fields.endDate,
    occurrence_count: fields.occurrenceCount,
    comments: fields.comments,
    balance_id: fields.balanceId,
  });
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, { action: "create", entityType: type, entityName: fields.name });

  revalidatePath(path);
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function updateMonthlyGoal(
  path: string,
  formData: FormData,
): Promise<RecurringItemActionState> {
  const id = formData.get("id") as string;
  const fields = readMonthlyGoalForm(formData, false);
  if (fields.error !== null) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("recurring_items")
    .update({
      name: fields.name,
      amount: fields.amount,
      start_date: fields.startDate,
      interval: fields.interval,
      unit: fields.unit,
      weekdays: fields.weekdays,
      days_of_month: fields.daysOfMonth,
      ordinal: fields.ordinal,
      ordinal_weekday: fields.ordinalWeekday,
      ends_type: fields.endsType,
      end_date: fields.endDate,
      occurrence_count: fields.occurrenceCount,
      comments: fields.comments,
      balance_id: fields.balanceId,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  if (user) {
    await logActivity(supabase, user.id, {
      action: "update",
      entityType: entityTypeFromPath(path),
      entityName: fields.name,
    });
  }

  await deleteStaleOverrides(supabase, id, {
    startDate: fields.startDate,
    interval: fields.interval,
    unit: fields.unit,
    weekdays: fields.weekdays,
    daysOfMonth: fields.daysOfMonth,
    ordinal: fields.ordinal,
    ordinalWeekday: fields.ordinalWeekday,
    endsType: fields.endsType,
    endDate: fields.endDate,
    occurrenceCount: fields.occurrenceCount,
  });

  revalidatePath(path);
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function deleteMonthlyGoal(path: string, formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: deleted } = await supabase.from("recurring_items").delete().eq("id", id).select("name").single();
  if (user && deleted) {
    await logActivity(supabase, user.id, {
      action: "delete",
      entityType: entityTypeFromPath(path),
      entityName: deleted.name,
    });
  }
  revalidatePath(path);
  revalidatePath("/forecast");
  revalidatePath("/");
}
