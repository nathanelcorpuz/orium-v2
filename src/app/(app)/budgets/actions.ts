"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { formatCentavos, parseCentavos } from "@/lib/money";
import { logActivity } from "@/lib/activityLog";
import { todayInManila } from "@/lib/date";
import { readRecurrenceRuleForm } from "@/lib/recurrenceForm";
import { expandRecurrenceOccurrences } from "@/lib/engine/recurrence";
import { applyToBudgetAccount } from "@/lib/budgetAccounts";
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
      // T204: optional link to a budget_accounts row - the same "optional
      // connection" pattern bills/income already use for a main account
      // (T71), just to a separate storage account instead.
      budgetAccountId: string | null;
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
  const budgetAccountId = (formData.get("budgetAccountId") as string) || null;

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
      budgetAccountId,
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
    return { error: null, name, allocation, linkedIncomeId, budgetAccountId, ...EMPTY_SCHEDULE };
  }

  return { error: null, name, allocation, linkedIncomeId: null, budgetAccountId, ...EMPTY_SCHEDULE };
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
    budget_account_id: fields.budgetAccountId,
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

  await logActivity(supabase, user.id, { action: "create", entityType: "budget", entityName: fields.name });

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("budgets")
    .update({
      name: fields.name,
      allocation: fields.allocation,
      monthly_allocation: fields.allocation,
      linked_income_id: fields.linkedIncomeId,
      budget_account_id: fields.budgetAccountId,
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

  if (user) await logActivity(supabase, user.id, { action: "update", entityType: "budget", entityName: fields.name });

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: deleted } = await supabase.from("budgets").delete().eq("id", id).select("name").single();
  if (user && deleted) {
    await logActivity(supabase, user.id, { action: "delete", entityType: "budget", entityName: deleted.name });
  }
  revalidatePath("/budgets");
  revalidatePath("/forecast");
  revalidatePath("/");
}

function readLedgerEntryForm(formData: FormData) {
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const entryDate = (formData.get("entryDate") as string) || todayInManila();
  const note = ((formData.get("note") as string) || "").trim() || null;

  // T192 (user request): 0 is a valid amount - only negative or unparseable
  // is rejected.
  if (amount === null || amount < 0) return { error: "Enter a valid amount." } as const;
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

  // T204: if this budget is stored in a budget account, the account's own
  // balance moves the same way the entry does - a real storage account,
  // not just a label. Looked up here rather than threaded through every
  // caller's hidden fields, same as deleteBudgetEntry's embedded select
  // below does for the budget's name.
  const { data: budgetRow } = await supabase
    .from("budgets")
    .select("budget_account_id")
    .eq("id", budgetId)
    .single();
  if (budgetRow?.budget_account_id) {
    const delta = direction === "incoming" ? fields.amount : -fields.amount;
    const accountError = await applyToBudgetAccount(supabase, budgetRow.budget_account_id, delta);
    if (accountError) return { error: accountError };
  }

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

  await logActivity(supabase, user.id, {
    action: "create",
    entityType: "budget_entry",
    entityName: budgetName,
    detail: fields.note
      ? `${defaultLabel}: ${formatCentavos(fields.amount)} - ${fields.note}`
      : `${defaultLabel}: ${formatCentavos(fields.amount)}`,
  });

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  // T204: direction isn't editable here, only the amount - so the linked
  // budget account (if any) only ever needs to move by the *difference*
  // between the old and new amount, not the full new amount again.
  if (oldEntry) {
    const { data: budgetRow } = await supabase
      .from("budgets")
      .select("budget_account_id")
      .eq("id", budgetId)
      .single();
    if (budgetRow?.budget_account_id) {
      const sign = oldEntry.direction === "incoming" ? 1 : -1;
      const accountError = await applyToBudgetAccount(
        supabase,
        budgetRow.budget_account_id,
        sign * (fields.amount - oldEntry.amount),
      );
      if (accountError) return { error: accountError };
    }
  }

  if (user) {
    await logActivity(supabase, user.id, {
      action: "update",
      entityType: "budget_entry",
      entityName: budgetName,
      detail: `${formatCentavos(fields.amount)}${fields.note ? ` - ${fields.note}` : ""}`,
    });
  }

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
// T134 (stress-test finding, flagged but deliberately left open by T133):
// used to be a bare `(formData) => void` action, which is why
// EditSettleModal.tsx's delete form had to close itself synchronously on
// submit rather than after the delete actually finished - a failed delete
// (this function never even checked Supabase's own error results) would
// fail completely silently, modal already gone. Now returns BudgetActionState
// like every other budget action here, so the caller can wait for it.
export async function deleteBudgetEntry(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Neither call site (BudgetEntriesModal, EditSettleModal) passes the
  // budget's name as a hidden field the way updateBudgetEntry's does - only
  // `id` - so it's pulled here via the same embedded-select Supabase already
  // supports, rather than threading a new prop through two components just
  // for a log line.
  const { data: entry } = await supabase
    .from("budget_entries")
    .select("budget_id, entry_date, amount, direction, budgets(name, budget_account_id)")
    .eq("id", id)
    .single();

  const { error: deleteError } = await supabase.from("budget_entries").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  // T204: reverse this entry's effect on its linked budget account, the
  // same way deleting a settlement doesn't touch a main account (T151's own
  // comment) - except here there's no separate settle step to have already
  // skipped it, so this delete is the one place that reversal has to happen.
  const linkedBudgetAccountId = entry?.budgets[0]?.budget_account_id;
  if (entry && linkedBudgetAccountId) {
    const sign = entry.direction === "incoming" ? 1 : -1;
    const accountError = await applyToBudgetAccount(supabase, linkedBudgetAccountId, -sign * entry.amount);
    if (accountError) return { error: accountError };
  }

  if (user && entry) {
    await logActivity(supabase, user.id, {
      action: "delete",
      entityType: "budget_entry",
      // Untyped Supabase client infers the embedded relation as an array
      // (the safe default without generated types), even though budget_id is
      // actually many-to-one.
      entityName: entry.budgets[0]?.name ?? "Budget",
      detail: formatCentavos(entry.amount),
    });
  }

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
  return { error: null };
}

// T204 (user request 2026-08-01): "another set of accounts that will be
// used as storage for the budgets" - separate from both the main Balances
// page and the budget's own allocation ledger. Managed from a sub-section
// on this same page rather than a new top-level nav item, per the user's
// own answer. Deliberately minimal CRUD (no separate Add/Take/Move funds
// UI for the account itself) - every real balance change already comes
// through a linked budget's own ledger activity (writeLedgerEntry/
// updateBudgetEntry/deleteBudgetEntry above); direct editing here is only
// for naming/correcting starting balances, the same "amount stays editable"
// shape the Balances page had before T186 introduced its own Add/Take/Move
// (never built here since it wasn't asked for).
function readBudgetAccountForm(formData: FormData) {
  const name = (formData.get("name") as string).trim();
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const comments = ((formData.get("comments") as string) || "").trim() || null;

  if (!name) return { error: "Name is required." } as const;
  if (amount === null) return { error: "Enter a valid amount." } as const;

  return { error: null, name, amount, comments } as const;
}

export async function createBudgetAccount(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const fields = readBudgetAccountForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("budget_accounts").insert({
    user_id: user.id,
    name: fields.name,
    amount: fields.amount,
    comments: fields.comments,
  });
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, { action: "create", entityType: "budget_account", entityName: fields.name });

  revalidatePath("/budgets");
  return { error: null };
}

export async function updateBudgetAccount(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const id = formData.get("id") as string;
  const fields = readBudgetAccountForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("budget_accounts")
    .update({ name: fields.name, amount: fields.amount, comments: fields.comments })
    .eq("id", id);
  if (error) return { error: error.message };

  if (user) {
    await logActivity(supabase, user.id, { action: "update", entityType: "budget_account", entityName: fields.name });
  }

  revalidatePath("/budgets");
  return { error: null };
}

export async function deleteBudgetAccount(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // `on delete set null` (migration 0040) clears any budget's link to this
  // account automatically - nothing here needs to touch the budgets table.
  const { data: deleted } = await supabase.from("budget_accounts").delete().eq("id", id).select("name").single();
  if (user && deleted) {
    await logActivity(supabase, user.id, { action: "delete", entityType: "budget_account", entityName: deleted.name });
  }
  revalidatePath("/budgets");
}

// T209 (user follow-up to T204): "budget accounts should have almost
// identical functionality with main accounts, but they don't have to have
// projected total balance." Mirrors accounts/actions.ts's own Add/Take/Move
// funds (T186) exactly, just against `budget_accounts`/
// `budget_account_transactions` (migration 0041) instead of `balances`/
// `balance_transactions` - no fee concept here, since a budget account was
// never part of the forecast/fee model T172 built.
function readBudgetAccountFundsForm(formData: FormData) {
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const entryDate = formData.get("entryDate") as string;
  const note = ((formData.get("note") as string) || "").trim() || null;
  if (amount === null || amount <= 0) return { error: "Enter a valid amount." } as const;
  if (!entryDate) return { error: "Date is required." } as const;
  return { error: null, amount, entryDate, note } as const;
}

export async function addBudgetAccountFunds(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const budgetAccountId = formData.get("budgetAccountId") as string;
  const budgetAccountName = formData.get("budgetAccountName") as string;
  const fields = readBudgetAccountFundsForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const accountError = await applyToBudgetAccount(supabase, budgetAccountId, fields.amount);
  if (accountError) return { error: accountError };

  const { error } = await supabase.from("budget_account_transactions").insert({
    user_id: user.id,
    budget_account_id: budgetAccountId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    direction: "incoming",
    note: fields.note,
  });
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "budget_account",
    entityName: budgetAccountName,
    detail: `Added funds: ${formatCentavos(fields.amount)}${fields.note ? ` (${fields.note})` : ""}`,
  });

  revalidatePath("/budgets");
  return { error: null };
}

export async function takeBudgetAccountFunds(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const budgetAccountId = formData.get("budgetAccountId") as string;
  const budgetAccountName = formData.get("budgetAccountName") as string;
  const fields = readBudgetAccountFundsForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const accountError = await applyToBudgetAccount(supabase, budgetAccountId, -fields.amount);
  if (accountError) return { error: accountError };

  const { error } = await supabase.from("budget_account_transactions").insert({
    user_id: user.id,
    budget_account_id: budgetAccountId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    direction: "outgoing",
    note: fields.note,
  });
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "budget_account",
    entityName: budgetAccountName,
    detail: `Took funds: ${formatCentavos(fields.amount)}${fields.note ? ` (${fields.note})` : ""}`,
  });

  revalidatePath("/budgets");
  return { error: null };
}

// Two ledger rows, not a third "transfer" direction - same reasoning
// moveAccountFunds (accounts/actions.ts) already documents.
export async function moveBudgetAccountFunds(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const fromId = formData.get("fromBudgetAccountId") as string;
  const toId = formData.get("toBudgetAccountId") as string;
  const fromName = formData.get("fromBudgetAccountName") as string;
  const toName = formData.get("toBudgetAccountName") as string;
  const fields = readBudgetAccountFundsForm(formData);
  if (fields.error) return { error: fields.error };
  if (!toId) return { error: "Choose an account to move funds to." };
  if (fromId === toId) return { error: "Choose two different accounts." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const fromError = await applyToBudgetAccount(supabase, fromId, -fields.amount);
  if (fromError) return { error: fromError };
  const toError = await applyToBudgetAccount(supabase, toId, fields.amount);
  if (toError) return { error: toError };

  const noteSuffix = fields.note ? ` (${fields.note})` : "";
  const { error: outError } = await supabase.from("budget_account_transactions").insert({
    user_id: user.id,
    budget_account_id: fromId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    direction: "outgoing",
    note: fields.note ?? `Moved to ${toName}`,
  });
  if (outError) return { error: outError.message };

  const { error: inError } = await supabase.from("budget_account_transactions").insert({
    user_id: user.id,
    budget_account_id: toId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    direction: "incoming",
    note: fields.note ?? `Moved from ${fromName}`,
  });
  if (inError) return { error: inError.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "budget_account",
    entityName: fromName,
    detail: `Moved ${formatCentavos(fields.amount)} to ${toName}${noteSuffix}`,
  });

  revalidatePath("/budgets");
  return { error: null };
}
