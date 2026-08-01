"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { formatCentavos, parseCentavos } from "@/lib/money";
import { logActivity } from "@/lib/activityLog";
import { todayInManila } from "@/lib/date";
import { readRecurrenceRuleForm } from "@/lib/recurrenceForm";
import { expandRecurrenceOccurrences } from "@/lib/engine/recurrence";
import { applyToBudgetAccount, loadBudgetAccountLinks } from "@/lib/budgetAccounts";
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

type BudgetAccountLinkField = { budgetAccountId: string; replenishAmount: number };

type BudgetFormFields =
  | { error: string }
  | {
      error: null;
      name: string;
      allocation: number;
      linkedIncomeId: string | null;
      // T218: zero or more connected budget accounts, replacing T204's
      // single optional `budgetAccountId` - each with its own configured
      // share of the replenishment (meaningless/unused for a manual budget,
      // where every log spend/add/take funds picks one account per
      // transaction instead, see writeLedgerEntry below).
      budgetAccountLinks: BudgetAccountLinkField[];
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
// T218: zero or more repeated (budgetAccountId, replenishAmountPesos) pairs,
// submitted as parallel same-name field lists (`BudgetModal.tsx` emits one
// row of the two inputs per connected account, in order) - the simplest
// shape a plain HTML form can post without client-side array serialization.
function readBudgetAccountLinks(
  formData: FormData,
): { error: string } | { error: null; links: BudgetAccountLinkField[]; allocation: number | null } {
  const ids = (formData.getAll("budgetAccountLinkIds") as string[]).filter((id) => id !== "");
  const amountsRaw = formData.getAll("budgetAccountLinkAmountsPesos") as string[];

  if (ids.length === 0) return { error: null, links: [], allocation: null };
  if (ids.length !== amountsRaw.length) {
    return { error: "Enter an amount for each connected budget account." };
  }
  if (new Set(ids).size !== ids.length) {
    return { error: "Choose a different budget account for each row." };
  }

  const links: BudgetAccountLinkField[] = [];
  for (let i = 0; i < ids.length; i++) {
    const amount = parseCentavos(amountsRaw[i]);
    if (amount === null || amount < 0) {
      return { error: "Enter a valid amount for each connected budget account." };
    }
    links.push({ budgetAccountId: ids[i], replenishAmount: amount });
  }

  return { error: null, links, allocation: links.reduce((sum, link) => sum + link.replenishAmount, 0) };
}

function readBudgetForm(formData: FormData): BudgetFormFields {
  const name = (formData.get("name") as string).trim();
  const source = formData.get("replenishSource") as string;

  const linksResult = readBudgetAccountLinks(formData);
  if (linksResult.error !== null) return { error: linksResult.error };
  const budgetAccountLinks = linksResult.links;

  // T218: with 1+ connected accounts, the allocation is derived (the sum of
  // each account's own share) rather than a directly-entered number - the
  // form doesn't even show the plain allocation field in that state
  // (BudgetModal.tsx). A budget with no connected accounts is unaffected.
  let allocation: number;
  if (budgetAccountLinks.length > 0) {
    allocation = linksResult.allocation!;
  } else {
    const parsed = parseCentavos(formData.get("allocationPesos") as string);
    if (parsed === null || parsed < 0) return { error: "Enter a valid allocation." };
    allocation = parsed;
  }

  if (!name) return { error: "Name is required." };

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
      budgetAccountLinks,
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
    return { error: null, name, allocation, linkedIncomeId, budgetAccountLinks, ...EMPTY_SCHEDULE };
  }

  return { error: null, name, allocation, linkedIncomeId: null, budgetAccountLinks, ...EMPTY_SCHEDULE };
}

// T218: mirrors the submitted set of connected accounts into
// budget_budget_accounts - delete-then-reinsert rather than diffing, since
// this table only ever mirrors the form's own current state and a budget
// realistically has a handful of connected accounts at most.
async function syncBudgetAccountLinks(
  supabase: SupabaseClient,
  userId: string,
  budgetId: string,
  links: BudgetAccountLinkField[],
): Promise<string | null> {
  const { error: deleteError } = await supabase.from("budget_budget_accounts").delete().eq("budget_id", budgetId);
  if (deleteError) return deleteError.message;
  if (links.length === 0) return null;

  const { error: insertError } = await supabase.from("budget_budget_accounts").insert(
    links.map((link) => ({
      user_id: userId,
      budget_id: budgetId,
      budget_account_id: link.budgetAccountId,
      replenish_amount: link.replenishAmount,
    })),
  );
  return insertError?.message ?? null;
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

  const { data: created, error } = await supabase
    .from("budgets")
    .insert({
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
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const linksError = await syncBudgetAccountLinks(supabase, user.id, created.id, fields.budgetAccountLinks);
  if (linksError) return { error: linksError };

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

  if (user) {
    const linksError = await syncBudgetAccountLinks(supabase, user.id, id, fields.budgetAccountLinks);
    if (linksError) return { error: linksError };
  }

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
//
// T218: which budget account (if any) this entry actually moved. 0
// connected accounts: unchanged, no account touched. 1: auto-used, no
// picker shown (`budgetAccountId` form field is ignored either way, since
// there's only one possible answer). 2+: the form's picker is required, and
// the submitted id must be one of the connected accounts.
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

  const links = await loadBudgetAccountLinks(supabase, budgetId);
  let budgetAccountId: string | null = null;
  if (links.length === 1) {
    budgetAccountId = links[0].budgetAccountId;
  } else if (links.length > 1) {
    const chosen = (formData.get("budgetAccountId") as string) || "";
    if (!links.some((link) => link.budgetAccountId === chosen)) {
      return { error: "Choose which budget account this affects." };
    }
    budgetAccountId = chosen;
  }

  const { error: entryError } = await supabase.from("budget_entries").insert({
    user_id: user.id,
    budget_id: budgetId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    note: fields.note,
    direction,
    budget_account_id: budgetAccountId,
  });
  if (entryError) return { error: entryError.message };

  // T204/T218: if this entry has a real account behind it, that account's
  // own balance moves the same way the entry does - a real storage account,
  // not just a label.
  if (budgetAccountId) {
    const delta = direction === "incoming" ? fields.amount : -fields.amount;
    const accountError = await applyToBudgetAccount(supabase, budgetAccountId, delta);
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
    budget_account_id: budgetAccountId,
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
    .select("entry_date, amount, direction, budget_account_id")
    .eq("id", id)
    .single();

  const { error: entryError } = await supabase
    .from("budget_entries")
    .update({ entry_date: fields.entryDate, amount: fields.amount, note: fields.note })
    .eq("id", id);
  if (entryError) return { error: entryError.message };

  // T204/T218: direction and the connected account aren't editable here,
  // only amount/date/note - so the entry's own `budget_account_id` (read
  // directly, not re-derived from the budget - it can have several accounts
  // now) only ever needs to move by the *difference* between the old and
  // new amount, not the full new amount again.
  if (oldEntry?.budget_account_id) {
    const sign = oldEntry.direction === "incoming" ? 1 : -1;
    const accountError = await applyToBudgetAccount(
      supabase,
      oldEntry.budget_account_id,
      sign * (fields.amount - oldEntry.amount),
    );
    if (accountError) return { error: accountError };
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
    .select("budget_id, entry_date, amount, direction, budget_account_id, budgets(name)")
    .eq("id", id)
    .single();

  const { error: deleteError } = await supabase.from("budget_entries").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  // T204/T218: reverse this entry's effect on its own connected budget
  // account (read directly off the entry, not re-derived from the budget),
  // the same way deleting a settlement doesn't touch a main account (T151's
  // own comment) - except here there's no separate settle step to have
  // already skipped it, so this delete is the one place that reversal has
  // to happen.
  const linkedBudgetAccountId = entry?.budget_account_id;
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

// T203 (user request): Move funds between two *budgets* - distinct from
// T209's moveBudgetAccountFunds above, which moves money between two
// budget *accounts* (the separate storage concept, T204). This one writes
// two budget_entries rows (outgoing/incoming), same two-leg shape every
// other "move" in this app uses, plus the matching settlements rows every
// other ledger entry gets (writeLedgerEntry above). If either budget has
// exactly one connected budget account (T204/T218), that account's balance
// moves too, on its own leg; with zero or with 2+ connected accounts on a
// side, only that side's own budget ledger moves - see the comment further
// down for why 2+ is left unresolved here rather than guessed at.
export async function moveBudgetFunds(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const fromId = formData.get("fromBudgetId") as string;
  const toId = formData.get("toBudgetId") as string;
  const fromName = formData.get("fromBudgetName") as string;
  const toName = formData.get("toBudgetName") as string;
  const fields = readLedgerEntryForm(formData);
  if (fields.error) return { error: fields.error };
  if (!toId) return { error: "Choose a budget to move funds to." };
  if (fromId === toId) return { error: "Choose two different budgets." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const noteSuffix = fields.note ? ` (${fields.note})` : "";

  // T218: moving funds between two *budgets* has no per-transaction account
  // picker (unlike Log spend/Add/Take funds) - with exactly one connected
  // account on a side, it's still unambiguous and auto-applies same as
  // before T218; with zero or with 2+ (which one?), only the two budgets'
  // own ledgers move and no physical budget account does, on that side.
  const fromLinks = await loadBudgetAccountLinks(supabase, fromId);
  const fromAccountId = fromLinks.length === 1 ? fromLinks[0].budgetAccountId : null;
  const toLinks = await loadBudgetAccountLinks(supabase, toId);
  const toAccountId = toLinks.length === 1 ? toLinks[0].budgetAccountId : null;

  const { error: outEntryError } = await supabase.from("budget_entries").insert({
    user_id: user.id,
    budget_id: fromId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    note: fields.note ?? `Moved to ${toName}`,
    direction: "outgoing",
    budget_account_id: fromAccountId,
  });
  if (outEntryError) return { error: outEntryError.message };

  if (fromAccountId) {
    const accountError = await applyToBudgetAccount(supabase, fromAccountId, -fields.amount);
    if (accountError) return { error: accountError };
  }

  const { error: outSettlementError } = await supabase.from("settlements").insert({
    user_id: user.id,
    source_type: "budget",
    source_id: fromId,
    name: `${fromName} - Moved to ${toName}`,
    type: "budget",
    forecasted_amount: 0,
    actual_amount: -fields.amount,
    forecasted_date: fields.entryDate,
    actual_date: fields.entryDate,
    forecasted_balance: 0,
    budget_account_id: fromAccountId,
  });
  if (outSettlementError) return { error: outSettlementError.message };

  const { error: inEntryError } = await supabase.from("budget_entries").insert({
    user_id: user.id,
    budget_id: toId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    note: fields.note ?? `Moved from ${fromName}`,
    direction: "incoming",
    budget_account_id: toAccountId,
  });
  if (inEntryError) return { error: inEntryError.message };

  if (toAccountId) {
    const accountError = await applyToBudgetAccount(supabase, toAccountId, fields.amount);
    if (accountError) return { error: accountError };
  }

  const { error: inSettlementError } = await supabase.from("settlements").insert({
    user_id: user.id,
    source_type: "budget",
    source_id: toId,
    name: `${toName} - Moved from ${fromName}`,
    type: "budget",
    forecasted_amount: 0,
    actual_amount: fields.amount,
    forecasted_date: fields.entryDate,
    actual_date: fields.entryDate,
    forecasted_balance: 0,
    budget_account_id: toAccountId,
  });
  if (inSettlementError) return { error: inSettlementError.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "budget",
    entityName: fromName,
    detail: `Moved ${formatCentavos(fields.amount)} to ${toName}${noteSuffix}`,
  });

  revalidatePath("/budgets");
  revalidatePath("/history");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}
