"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import { readRecurrenceRuleForm } from "@/lib/recurrenceForm";
import { deleteStaleOverrides } from "@/lib/staleOverrides";
import { logActivity } from "@/lib/activityLog";

export type BillActionState = { error: string | null };

function readBillForm(formData: FormData, isCreate: boolean) {
  const name = (formData.get("name") as string).trim();
  const amountPesos = parseCentavos(formData.get("amountPesos") as string);
  const startDate = formData.get("startDate") as string;
  const comments = ((formData.get("comments") as string) || "").trim() || null;
  const balanceId = (formData.get("balanceId") as string) || null;

  if (!name) return { error: "Name is required." } as const;
  // T192 (user request): 0 is a valid amount - e.g. a placeholder bill being
  // tracked before its real cost is known. Only an unparseable value is
  // rejected.
  if (amountPesos === null) {
    return { error: "Enter a valid amount." } as const;
  }
  if (!startDate) return { error: "Start date is required." } as const;

  // T107: only a brand-new bill can't start in the past - editing an
  // existing one (whose start date is almost always already in the past,
  // legitimately) must stay unrestricted.
  const rule = readRecurrenceRuleForm(formData, { enforceFutureStart: isCreate });
  if (rule.error !== null) return { error: rule.error };

  return {
    ...rule,
    name,
    amount: -Math.abs(amountPesos),
    startDate,
    comments,
    balanceId,
  } as const;
}

export async function createBill(
  _prevState: BillActionState,
  formData: FormData,
): Promise<BillActionState> {
  const fields = readBillForm(formData, true);
  if (fields.error !== null) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("recurring_items").insert({
    user_id: user.id,
    name: fields.name,
    type: "bill",
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

  await logActivity(supabase, user.id, { action: "create", entityType: "bill", entityName: fields.name });

  revalidatePath("/bills");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function updateBill(
  _prevState: BillActionState,
  formData: FormData,
): Promise<BillActionState> {
  const id = formData.get("id") as string;
  const fields = readBillForm(formData, false);
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

  if (user) await logActivity(supabase, user.id, { action: "update", entityType: "bill", entityName: fields.name });

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

  revalidatePath("/bills");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function deleteBill(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: deleted } = await supabase.from("recurring_items").delete().eq("id", id).select("name").single();
  if (user && deleted) {
    await logActivity(supabase, user.id, { action: "delete", entityType: "bill", entityName: deleted.name });
  }
  revalidatePath("/bills");
  revalidatePath("/forecast");
  revalidatePath("/");
}
