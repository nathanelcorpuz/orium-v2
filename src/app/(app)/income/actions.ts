"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import { readRecurrenceRuleForm } from "@/lib/recurrenceForm";
import { deleteStaleOverrides } from "@/lib/staleOverrides";
import { logActivity } from "@/lib/activityLog";

export type IncomeActionState = { error: string | null };

// T212: paired same-name fields (IncomeModal.tsx) - FormData preserves
// insertion order for repeated names, so index i of one list pairs with
// index i of the other, same convention a browser's own multi-value form
// submission already guarantees. A row with no destination chosen is a
// blank/unfinished one, silently dropped rather than rejected - the same
// forgiving handling an empty "add another" row gets elsewhere in this app.
function readIncomeAutoMovesForm(
  formData: FormData,
  incomeBalanceId: string | null,
): { error: string | null; autoMoves: { destinationBalanceId: string; amount: number }[] } {
  const destinationIds = formData.getAll("autoMoveDestinationId") as string[];
  const amountsPesos = formData.getAll("autoMoveAmountPesos") as string[];
  const autoMoves: { destinationBalanceId: string; amount: number }[] = [];

  for (let i = 0; i < destinationIds.length; i++) {
    const destinationBalanceId = destinationIds[i];
    if (!destinationBalanceId) continue;
    if (destinationBalanceId === incomeBalanceId) {
      return { error: "An auto-move destination can't be the same account this income is added to.", autoMoves: [] };
    }
    const amount = parseCentavos(amountsPesos[i] ?? "");
    if (amount === null || amount <= 0) {
      return { error: "Enter a valid amount for each auto-move rule.", autoMoves: [] };
    }
    autoMoves.push({ destinationBalanceId, amount });
  }

  return { error: null, autoMoves };
}

function readIncomeForm(formData: FormData, isCreate: boolean) {
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

  // T107: only a brand-new income item can't start in the past.
  const rule = readRecurrenceRuleForm(formData, { enforceFutureStart: isCreate });
  if (rule.error !== null) return { error: rule.error };

  return {
    ...rule,
    name,
    amount: Math.abs(amountPesos),
    startDate,
    comments,
    balanceId,
  } as const;
}

export async function createIncome(
  _prevState: IncomeActionState,
  formData: FormData,
): Promise<IncomeActionState> {
  const fields = readIncomeForm(formData, true);
  if (fields.error !== null) return { error: fields.error };
  const autoMoveFields = readIncomeAutoMovesForm(formData, fields.balanceId);
  if (autoMoveFields.error !== null) return { error: autoMoveFields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: inserted, error } = await supabase
    .from("recurring_items")
    .insert({
      user_id: user.id,
      name: fields.name,
      type: "income",
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
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (autoMoveFields.autoMoves.length > 0) {
    const { error: autoMoveError } = await supabase.from("income_auto_moves").insert(
      autoMoveFields.autoMoves.map((autoMove) => ({
        user_id: user.id,
        income_id: inserted.id,
        destination_balance_id: autoMove.destinationBalanceId,
        amount: autoMove.amount,
      })),
    );
    if (autoMoveError) return { error: autoMoveError.message };
  }

  await logActivity(supabase, user.id, { action: "create", entityType: "income", entityName: fields.name });

  revalidatePath("/income");
  revalidatePath("/forecast");
  revalidatePath("/accounts");
  revalidatePath("/");
  return { error: null };
}

export async function updateIncome(
  _prevState: IncomeActionState,
  formData: FormData,
): Promise<IncomeActionState> {
  const id = formData.get("id") as string;
  const fields = readIncomeForm(formData, false);
  if (fields.error !== null) return { error: fields.error };
  const autoMoveFields = readIncomeAutoMovesForm(formData, fields.balanceId);
  if (autoMoveFields.error !== null) return { error: autoMoveFields.error };

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

  // T212: full replace rather than a diff - simplest correct way to handle
  // add/edit/remove all at once for a small repeatable list with no other
  // table referencing these rows by id (unlike, say, budget entries, which
  // have their own history to preserve).
  const { error: deleteAutoMovesError } = await supabase.from("income_auto_moves").delete().eq("income_id", id);
  if (deleteAutoMovesError) return { error: deleteAutoMovesError.message };
  if (autoMoveFields.autoMoves.length > 0 && user) {
    const { error: autoMoveError } = await supabase.from("income_auto_moves").insert(
      autoMoveFields.autoMoves.map((autoMove) => ({
        user_id: user.id,
        income_id: id,
        destination_balance_id: autoMove.destinationBalanceId,
        amount: autoMove.amount,
      })),
    );
    if (autoMoveError) return { error: autoMoveError.message };
  }

  if (user) await logActivity(supabase, user.id, { action: "update", entityType: "income", entityName: fields.name });

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

  revalidatePath("/income");
  revalidatePath("/forecast");
  revalidatePath("/accounts");
  revalidatePath("/");
  return { error: null };
}

export async function deleteIncome(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: deleted } = await supabase.from("recurring_items").delete().eq("id", id).select("name").single();
  if (user && deleted) {
    await logActivity(supabase, user.id, { action: "delete", entityType: "income", entityName: deleted.name });
  }
  revalidatePath("/income");
  revalidatePath("/forecast");
  revalidatePath("/");
}
