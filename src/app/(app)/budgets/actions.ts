"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { readRecurrenceRuleForm } from "@/lib/recurrenceForm";
import { expandRecurrenceOccurrences } from "@/lib/engine/recurrence";
import type { RecurrenceEndsType, RecurrenceUnit } from "@/lib/engine/types";

export type BudgetActionState = { error: string | null };

const EMPTY_SCHEDULE = {
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
} as const;

type BudgetFormFields =
  | { error: string }
  | {
      error: null;
      name: string;
      allocation: number;
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

// Phase 11 (SPEC.md T60): a budget's replenish mode is one of three,
// carried by the hidden `replenishSource` field the SegmentedControl
// writes - "income" (linkedIncomeId set, no schedule), "schedule"
// ("replenish every" - the budget's own rule via the shared RecurrencePicker/
// readRecurrenceRuleForm, same as Bills/Income/Debt/Savings), or "manual"
// (neither). Whichever mode isn't chosen gets explicitly nulled out so
// switching modes on an existing budget clears the old mode's data instead
// of leaving it behind - DB-enforced mutual exclusivity between
// linked_income_id and start_date (migration 0011) means leaving stale data
// in the unused mode would eventually violate that constraint anyway.
function readBudgetForm(formData: FormData): BudgetFormFields {
  const name = (formData.get("name") as string).trim();
  const allocation = parseCentavos(formData.get("allocationPesos") as string);
  const source = formData.get("replenishSource") as string;

  if (!name) return { error: "Name is required." };
  if (allocation === null || allocation < 0) return { error: "Enter a valid allocation." };

  if (source === "schedule") {
    const startDate = (formData.get("startDate") as string) || "";
    if (!startDate) return { error: "Start date is required." };

    const rule = readRecurrenceRuleForm(formData);
    if (rule.error !== null) return { error: rule.error };

    return {
      error: null,
      name,
      allocation,
      linkedIncomeId: null,
      startDate,
      interval: rule.interval,
      unit: rule.unit,
      weekdays: rule.weekdays,
      daysOfMonth: rule.daysOfMonth,
      ordinal: rule.ordinal,
      ordinalWeekday: rule.ordinalWeekday,
      endsType: rule.endsType,
      endDate: rule.endDate,
      occurrenceCount: rule.occurrenceCount,
    };
  }

  if (source === "income") {
    const linkedIncomeId = (formData.get("linkedIncomeId") as string) || null;
    if (!linkedIncomeId) return { error: "Choose an income source." };
    return { error: null, name, allocation, linkedIncomeId, ...EMPTY_SCHEDULE };
  }

  return { error: null, name, allocation, linkedIncomeId: null, ...EMPTY_SCHEDULE };
}

// Phase 11 (T60): mirrors deleteStaleOverrides (staleOverrides.ts, T42 part
// A) for a budget's own replenish schedule - editing the rule directly
// shouldn't leave budget_replenish_overrides rows pointing at dates the new
// rule no longer produces. Only run when the budget still has a schedule
// after the edit (switching away from "schedule" entirely just makes the
// old overrides permanently inert, which is harmless - forecast.ts never
// looks them up again once start_date is null).
async function deleteStaleBudgetReplenishOverrides(
  supabase: SupabaseClient,
  budgetId: string,
  newRule: Parameters<typeof expandRecurrenceOccurrences>[0],
): Promise<void> {
  const { data: overrides } = await supabase
    .from("budget_replenish_overrides")
    .select("id, original_date")
    .eq("budget_id", budgetId);

  const staleIds = (overrides ?? [])
    .filter((o) => expandRecurrenceOccurrences(newRule, o.original_date, o.original_date).length === 0)
    .map((o) => o.id);

  if (staleIds.length > 0) {
    await supabase.from("budget_replenish_overrides").delete().in("id", staleIds);
  }
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
    // Mirrors `allocation` - monthly_allocation is still NOT NULL until a
    // (still-deferred, see SPEC.md) migration drops it.
    monthly_allocation: fields.allocation,
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

  if (fields.startDate !== null) {
    await deleteStaleBudgetReplenishOverrides(supabase, id, {
      startDate: fields.startDate,
      interval: fields.interval!,
      unit: fields.unit!,
      weekdays: fields.weekdays,
      daysOfMonth: fields.daysOfMonth,
      ordinal: fields.ordinal,
      ordinalWeekday: fields.ordinalWeekday,
      endsType: fields.endsType!,
      endDate: fields.endDate,
      occurrenceCount: fields.occurrenceCount,
    });
  }

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

function readLedgerEntryForm(formData: FormData) {
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const entryDate = (formData.get("entryDate") as string) || todayInManila();
  const note = ((formData.get("note") as string) || "").trim() || null;

  if (amount === null || amount <= 0) return { error: "Enter a valid amount." } as const;
  if (!entryDate) return { error: "Date is required." } as const;

  return { error: null, amount, entryDate, note } as const;
}

// Every ledger entry (spend, manual add, manual take - SPEC.md Phase 10)
// writes both a budget_entries row and a settlement row so History stays a
// complete record of actual money movement. There's no forecast row being
// settled here (budgets don't go through the Edit/Settle modal), so
// forecasted_amount and forecasted_balance have no meaningful value - both
// are 0. actual_amount's sign follows direction, same convention
// recurring-item settlements already use (income positive, bill negative).
async function writeLedgerEntry(
  formData: FormData,
  direction: "incoming" | "outgoing",
  defaultLabel: string,
): Promise<BudgetActionState> {
  const budgetId = formData.get("budgetId") as string;
  const budgetName = formData.get("budgetName") as string;
  const fields = readLedgerEntryForm(formData);
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
    direction,
  });
  if (entryError) return { error: entryError.message };

  const { error: settlementError } = await supabase.from("settlements").insert({
    user_id: user.id,
    source_type: "budget",
    source_id: budgetId,
    name: fields.note ? `${budgetName} - ${fields.note}` : `${budgetName} - ${defaultLabel}`,
    type: "budget",
    forecasted_amount: 0,
    actual_amount: direction === "incoming" ? fields.amount : -fields.amount,
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

export async function logSpend(_prevState: BudgetActionState, formData: FormData): Promise<BudgetActionState> {
  return writeLedgerEntry(formData, "outgoing", "spend");
}

// Manual add/take (SPEC.md T55): for a budget with no linked income, the
// user replenishes or reduces it directly instead of it happening
// automatically on a settled income (T56, income-linked budgets only).
export async function addFunds(_prevState: BudgetActionState, formData: FormData): Promise<BudgetActionState> {
  return writeLedgerEntry(formData, "incoming", "Added funds");
}

export async function takeFunds(_prevState: BudgetActionState, formData: FormData): Promise<BudgetActionState> {
  return writeLedgerEntry(formData, "outgoing", "Took funds");
}

// SPEC.md T42 part B (extended for Phase 10 to cover every ledger entry, not
// just spends): a logged entry can be moved to a different date instead of
// only create/delete. Same no-FK matching trick as deleteBudgetEntry - the
// OLD entry's fields locate its settlement row before either one changes.
// direction itself isn't editable here (fixed at creation, same as which
// budget it belongs to) - only amount/date/note.
export async function updateBudgetEntry(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const id = formData.get("id") as string;
  const budgetId = formData.get("budgetId") as string;
  const budgetName = formData.get("budgetName") as string;
  const fields = readLedgerEntryForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();

  const { data: oldEntry } = await supabase
    .from("budget_entries")
    .select("entry_date, amount, direction")
    .eq("id", id)
    .single();

  const { error: entryError } = await supabase
    .from("budget_entries")
    .update({ entry_date: fields.entryDate, amount: fields.amount, note: fields.note })
    .eq("id", id);
  if (entryError) return { error: entryError.message };

  if (oldEntry) {
    const sign = oldEntry.direction === "incoming" ? 1 : -1;
    await supabase
      .from("settlements")
      .update({
        name: fields.note ? `${budgetName} - ${fields.note}` : budgetName,
        actual_amount: sign * fields.amount,
        actual_date: fields.entryDate,
        forecasted_date: fields.entryDate,
      })
      .eq("source_type", "budget")
      .eq("source_id", budgetId)
      .eq("actual_date", oldEntry.entry_date)
      .eq("actual_amount", sign * oldEntry.amount);
  }

  revalidatePath("/budgets");
  revalidatePath("/history");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

// budget_entries has no FK back from settlements, so a deleted entry's
// settlement row is found by matching the same fields it was written with
// (source_type/source_id/actual_date/actual_amount) rather than an id -
// otherwise deleting an entry would leave a phantom transaction in History.
export async function deleteBudgetEntry(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("budget_entries")
    .select("budget_id, entry_date, amount, direction")
    .eq("id", id)
    .single();

  await supabase.from("budget_entries").delete().eq("id", id);

  if (entry) {
    const sign = entry.direction === "incoming" ? 1 : -1;
    await supabase
      .from("settlements")
      .delete()
      .eq("source_type", "budget")
      .eq("source_id", entry.budget_id)
      .eq("actual_date", entry.entry_date)
      .eq("actual_amount", sign * entry.amount);
  }

  revalidatePath("/budgets");
  revalidatePath("/history");
  revalidatePath("/forecast");
  revalidatePath("/");
}
