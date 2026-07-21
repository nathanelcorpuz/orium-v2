"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { readRecurrenceRuleForm } from "@/lib/recurrenceForm";
import type { RecurrenceEndsType, RecurrenceUnit } from "@/lib/engine/types";

export type BudgetActionState = { error: string | null };

type BudgetFields = {
  name: string;
  allocation: number;
  carryoverEnabled: boolean;
  linkedIncomeId: string | null;
  startDate: string | null;
  interval: number | null;
  unit: RecurrenceUnit | null;
  weekdays: number[] | null;
  daysOfMonth: number[] | null;
  ordinal: number | null;
  ordinalWeekday: number | null;
  endsType: RecurrenceEndsType | null;
  endDate: string | null;
  occurrenceCount: number | null;
};

// A budget's replenish source (SPEC.md T38) is one of two complete shapes -
// linked income (just an id) or its own schedule (the full recurrence rule,
// same fields RecurrencePicker/readRecurrenceRuleForm already produce for
// Bills/Income/Debt/Savings). Whichever isn't chosen is written as all-null,
// matching migration 0006's "complete rule or nothing" constraints.
function readBudgetForm(formData: FormData): { error: string } | ({ error: null } & BudgetFields) {
  const name = (formData.get("name") as string).trim();
  const allocation = parseCentavos(formData.get("allocationPesos") as string);
  const carryoverEnabled = formData.get("carryoverEnabled") === "on";
  const replenishSource = formData.get("replenishSource") as string;

  if (!name) return { error: "Name is required." };
  if (allocation === null || allocation < 0) return { error: "Enter a valid allocation." };

  if (replenishSource === "income") {
    const linkedIncomeId = (formData.get("linkedIncomeId") as string) || "";
    if (!linkedIncomeId) return { error: "Choose an income source." };
    return {
      error: null,
      name,
      allocation,
      carryoverEnabled,
      linkedIncomeId,
      startDate: null,
      interval: null,
      unit: null,
      weekdays: null,
      daysOfMonth: null,
      ordinal: null,
      ordinalWeekday: null,
      endsType: null,
      endDate: null,
      occurrenceCount: null,
    };
  }

  if (replenishSource === "schedule") {
    const startDate = formData.get("startDate") as string;
    if (!startDate) return { error: "Start date is required." };
    const rule = readRecurrenceRuleForm(formData);
    if (rule.error !== null) return { error: rule.error };
    return {
      name,
      allocation,
      carryoverEnabled,
      linkedIncomeId: null,
      startDate,
      ...rule,
    };
  }

  return { error: "Choose how this budget replenishes." };
}

export async function createBudget(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const fields = readBudgetForm(formData);
  if (fields.error !== null) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("budgets").insert({
    user_id: user.id,
    name: fields.name,
    allocation: fields.allocation,
    // Mirrors `allocation` - monthly_allocation is still NOT NULL until
    // migration 0007 drops it (deferred until nothing reads it; see SPEC.md).
    monthly_allocation: fields.allocation,
    carryover_enabled: fields.carryoverEnabled,
    linked_income_id: fields.linkedIncomeId,
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
  });
  if (error) return { error: error.message };

  revalidatePath("/budgets");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function updateBudget(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const id = formData.get("id") as string;
  const fields = readBudgetForm(formData);
  if (fields.error !== null) return { error: fields.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("budgets")
    .update({
      name: fields.name,
      allocation: fields.allocation,
      monthly_allocation: fields.allocation,
      carryover_enabled: fields.carryoverEnabled,
      linked_income_id: fields.linkedIncomeId,
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
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/budgets");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function deleteBudget(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("budgets").delete().eq("id", id);
  revalidatePath("/budgets");
  revalidatePath("/forecast");
  revalidatePath("/");
}

function readLogSpendForm(formData: FormData) {
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const entryDate = (formData.get("entryDate") as string) || todayInManila();
  const note = ((formData.get("note") as string) || "").trim() || null;

  if (amount === null || amount <= 0) return { error: "Enter a valid spend amount." } as const;
  if (!entryDate) return { error: "Date is required." } as const;

  return { error: null, amount, entryDate, note } as const;
}

// Logging a spend writes both a budget_entries row and a settlement row
// (SPEC.md budget spend-logging rule) so History stays a complete record of actual
// money movement. There's no forecast row being settled here (budgets
// don't go through the Edit/Settle modal), so forecasted_amount and
// forecasted_balance have no meaningful value - both are 0.
export async function logSpend(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const budgetId = formData.get("budgetId") as string;
  const budgetName = formData.get("budgetName") as string;
  const fields = readLogSpendForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error: entryError } = await supabase.from("budget_entries").insert({
    user_id: user.id,
    budget_id: budgetId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    note: fields.note,
  });
  if (entryError) return { error: entryError.message };

  const { error: settlementError } = await supabase.from("settlements").insert({
    user_id: user.id,
    source_type: "budget",
    source_id: budgetId,
    name: fields.note ? `${budgetName} - ${fields.note}` : budgetName,
    type: "budget",
    forecasted_amount: 0,
    actual_amount: -fields.amount,
    forecasted_date: fields.entryDate,
    actual_date: fields.entryDate,
    forecasted_balance: 0,
  });
  if (settlementError) return { error: settlementError.message };

  revalidatePath("/budgets");
  revalidatePath("/history");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

// budget_entries has no FK back from settlements, so a deleted entry's
// settlement row is found by matching the same fields logSpend wrote it
// with (source_type/source_id/actual_date/actual_amount) rather than an id -
// otherwise deleting an entry would leave a phantom "spend" in History.
export async function deleteBudgetEntry(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("budget_entries")
    .select("budget_id, entry_date, amount")
    .eq("id", id)
    .single();

  await supabase.from("budget_entries").delete().eq("id", id);

  if (entry) {
    await supabase
      .from("settlements")
      .delete()
      .eq("source_type", "budget")
      .eq("source_id", entry.budget_id)
      .eq("actual_date", entry.entry_date)
      .eq("actual_amount", -entry.amount);
  }

  revalidatePath("/budgets");
  revalidatePath("/history");
  revalidatePath("/forecast");
  revalidatePath("/");
}
