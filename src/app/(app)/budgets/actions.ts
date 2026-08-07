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

type BudgetAccountLinkField = { balanceId: string; replenishAmount: number };

type BudgetFormFields =
  | { error: string }
  | {
      error: null;
      name: string;
      allocation: number;
      linkedIncomeId: string | null;
      // T218: zero or more connected budget accounts, replacing T204's
      // single optional `balanceId` - each with its own configured
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
// T218: zero or more repeated (balanceId, replenishAmountPesos) pairs,
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
    links.push({ balanceId: ids[i], replenishAmount: amount });
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
      balance_id: link.balanceId,
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
// picker shown (`balanceId` form field is ignored either way, since
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
  let balanceId: string | null = null;
  if (links.length === 1) {
    balanceId = links[0].balanceId;
  } else if (links.length > 1) {
    const chosen = (formData.get("balanceId") as string) || "";
    if (!links.some((link) => link.balanceId === chosen)) {
      return { error: "Choose which budget account this affects." };
    }
    balanceId = chosen;
  }

  const { error: entryError } = await supabase.from("budget_entries").insert({
    user_id: user.id,
    budget_id: budgetId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    note: fields.note,
    direction,
    balance_id: balanceId,
  });
  if (entryError) return { error: entryError.message };

  // T204/T218: if this entry has a real account behind it, that account's
  // own balance moves the same way the entry does - a real storage account,
  // not just a label.
  if (balanceId) {
    const delta = direction === "incoming" ? fields.amount : -fields.amount;
    const accountError = await applyToBudgetAccount(supabase, balanceId, delta);
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
    balance_id: balanceId,
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
    .select("entry_date, amount, direction, balance_id")
    .eq("id", id)
    .single();

  const { error: entryError } = await supabase
    .from("budget_entries")
    .update({ entry_date: fields.entryDate, amount: fields.amount, note: fields.note })
    .eq("id", id);
  if (entryError) return { error: entryError.message };

  // T204/T218: direction and the connected account aren't editable here,
  // only amount/date/note - so the entry's own `balance_id` (read
  // directly, not re-derived from the budget - it can have several accounts
  // now) only ever needs to move by the *difference* between the old and
  // new amount, not the full new amount again.
  if (oldEntry?.balance_id) {
    const sign = oldEntry.direction === "incoming" ? 1 : -1;
    const accountError = await applyToBudgetAccount(
      supabase,
      oldEntry.balance_id,
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
    .select("budget_id, entry_date, amount, direction, balance_id, budgets(name)")
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
  const linkedBudgetAccountId = entry?.balance_id;
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

// T222 (user request 2026-08-02): revises T220's proportional auto-split
// for this specific call site - a manual "Move funds" is exactly the kind
// of deliberate, interactive action where the user should be asked, not
// have an amount silently divided for them (unlike automatic replenishment,
// which has no such moment - `writeBudgetReplenishLegs`, forecast/
// actions.ts, keeps the proportional split for that reason). 0 connected
// accounts: ledger-only, unchanged. 1: auto-applies to that account. 2+:
// `chosenAccountId` (from the form's own picker, see MoveBudgetFundsModal)
// must be one of the connected accounts.
async function writeBudgetMoveLeg(
  supabase: SupabaseClient,
  userId: string,
  budgetId: string,
  budgetName: string,
  amount: number,
  direction: "incoming" | "outgoing",
  entryDate: string,
  defaultNote: string,
  userNote: string | null,
  chosenAccountId: string | null,
): Promise<string | null> {
  const sign = direction === "incoming" ? 1 : -1;
  const links = await loadBudgetAccountLinks(supabase, budgetId);

  let balanceId: string | null = null;
  if (links.length === 1) {
    balanceId = links[0].balanceId;
  } else if (links.length > 1) {
    if (!chosenAccountId || !links.some((link) => link.balanceId === chosenAccountId)) {
      return `Choose which of ${budgetName}'s accounts this affects.`;
    }
    balanceId = chosenAccountId;
  }
  const note = userNote ?? defaultNote;

  const { error: entryError } = await supabase.from("budget_entries").insert({
    user_id: userId,
    budget_id: budgetId,
    entry_date: entryDate,
    amount,
    note,
    direction,
    balance_id: balanceId,
  });
  if (entryError) return entryError.message;

  if (balanceId) {
    const accountError = await applyToBudgetAccount(supabase, balanceId, sign * amount);
    if (accountError) return accountError;
  }

  const { error: settlementError } = await supabase.from("settlements").insert({
    user_id: userId,
    source_type: "budget",
    source_id: budgetId,
    name: `${budgetName} - ${note}`,
    type: "budget",
    forecasted_amount: 0,
    actual_amount: sign * amount,
    forecasted_date: entryDate,
    actual_date: entryDate,
    forecasted_balance: 0,
    balance_id: balanceId,
  });
  return settlementError?.message ?? null;
}

// T222 (user request 2026-08-02): moves a *single budget's own money*
// between two of its own connected accounts - "I want to move Pocket
// Money funds from GCash Tatay to Cash Tatay." A regular account-to-account
// move between two of the user's own accounts already has its own action
// (accounts/actions.ts's moveAccountFunds) - this one is distinct because
// it's net zero on the *budget's* own running total (still the same
// budget's money, just physically relocated), and only ever legal between
// two accounts already connected to that one budget. Distinct from
// `moveBudgetFunds` below too, which moves money between two different
// budgets' own ledgers.
function readBudgetOwnAccountMoveForm(formData: FormData) {
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const entryDate = (formData.get("entryDate") as string) || todayInManila();
  const note = ((formData.get("note") as string) || "").trim() || null;
  if (amount === null || amount <= 0) return { error: "Enter a valid amount." } as const;
  if (!entryDate) return { error: "Date is required." } as const;
  return { error: null, amount, entryDate, note } as const;
}

export async function moveBudgetOwnAccountFunds(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const budgetId = formData.get("budgetId") as string;
  const budgetName = formData.get("budgetName") as string;
  const fromAccountId = formData.get("fromBudgetAccountId") as string;
  const toAccountId = formData.get("toBudgetAccountId") as string;
  const fields = readBudgetOwnAccountMoveForm(formData);
  if (fields.error) return { error: fields.error };
  if (!fromAccountId || !toAccountId) return { error: "Choose both accounts." };
  if (fromAccountId === toAccountId) return { error: "Choose two different accounts." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const links = await loadBudgetAccountLinks(supabase, budgetId);
  const fromLink = links.find((link) => link.balanceId === fromAccountId);
  const toLink = links.find((link) => link.balanceId === toAccountId);
  if (!fromLink || !toLink) return { error: "Both accounts must be connected to this budget." };

  const noteSuffix = fields.note ? ` (${fields.note})` : "";

  const { error: outEntryError } = await supabase.from("budget_entries").insert({
    user_id: user.id,
    budget_id: budgetId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    note: fields.note ?? `Moved to ${toLink.name}`,
    direction: "outgoing",
    balance_id: fromAccountId,
  });
  if (outEntryError) return { error: outEntryError.message };

  const fromAccountError = await applyToBudgetAccount(supabase, fromAccountId, -fields.amount);
  if (fromAccountError) return { error: fromAccountError };

  const { error: outSettlementError } = await supabase.from("settlements").insert({
    user_id: user.id,
    source_type: "budget",
    source_id: budgetId,
    name: `${budgetName} - Moved to ${toLink.name}`,
    type: "budget",
    forecasted_amount: 0,
    actual_amount: -fields.amount,
    forecasted_date: fields.entryDate,
    actual_date: fields.entryDate,
    forecasted_balance: 0,
    balance_id: fromAccountId,
  });
  if (outSettlementError) return { error: outSettlementError.message };

  const { error: inEntryError } = await supabase.from("budget_entries").insert({
    user_id: user.id,
    budget_id: budgetId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    note: fields.note ?? `Moved from ${fromLink.name}`,
    direction: "incoming",
    balance_id: toAccountId,
  });
  if (inEntryError) return { error: inEntryError.message };

  const toAccountError = await applyToBudgetAccount(supabase, toAccountId, fields.amount);
  if (toAccountError) return { error: toAccountError };

  const { error: inSettlementError } = await supabase.from("settlements").insert({
    user_id: user.id,
    source_type: "budget",
    source_id: budgetId,
    name: `${budgetName} - Moved from ${fromLink.name}`,
    type: "budget",
    forecasted_amount: 0,
    actual_amount: fields.amount,
    forecasted_date: fields.entryDate,
    actual_date: fields.entryDate,
    forecasted_balance: 0,
    balance_id: toAccountId,
  });
  if (inSettlementError) return { error: inSettlementError.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "budget",
    entityName: budgetName,
    detail: `Moved ${formatCentavos(fields.amount)} from ${fromLink.name} to ${toLink.name}${noteSuffix}`,
  });

  revalidatePath("/budgets");
  revalidatePath("/history");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

// T203 (user request): Move funds between two *budgets* - distinct from
// moveBudgetOwnAccountFunds above, which moves a single budget's own money
// between two of its own connected accounts. Each side writes via
// writeBudgetMoveLeg above - a matching budget_entries + settlement leg per
// connected account on that side, splitting proportionally once a side has
// 2+ connected accounts (T218 follow-up, 2026-08-02).
export async function moveBudgetFunds(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const fromId = formData.get("fromBudgetId") as string;
  const toId = formData.get("toBudgetId") as string;
  const fromName = formData.get("fromBudgetName") as string;
  const toName = formData.get("toBudgetName") as string;
  // T222: which of the source/destination budget's own connected accounts
  // this move actually touches - required only when that side has 2+
  // (MoveBudgetFundsModal only renders the picker in that case).
  const fromBudgetAccountId = (formData.get("fromBudgetAccountId") as string) || null;
  const toBudgetAccountId = (formData.get("toBudgetAccountId") as string) || null;
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

  const outLegError = await writeBudgetMoveLeg(
    supabase,
    user.id,
    fromId,
    fromName,
    fields.amount,
    "outgoing",
    fields.entryDate,
    `Moved to ${toName}`,
    fields.note,
    fromBudgetAccountId,
  );
  if (outLegError) return { error: outLegError };

  const inLegError = await writeBudgetMoveLeg(
    supabase,
    user.id,
    toId,
    toName,
    fields.amount,
    "incoming",
    fields.entryDate,
    `Moved from ${fromName}`,
    fields.note,
    toBudgetAccountId,
  );
  if (inLegError) return { error: inLegError };

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

// T284 follow-up (SPEC.md Phase 49, user request 2026-08-08): "how much of
// this budget's money do you assume is already spoken for" - drives the
// Forecast/Peaks and Drops "Budget usage" sliders. Called directly (not
// FormData/useActionState) since a slider fires many times while being
// dragged - BudgetUsagePanel.tsx debounces and calls this plainly, updating
// its own local state instantly for live feedback rather than waiting on
// this round-trip. No logActivity call - a personal display assumption, not
// a financial record, and would spam the Updates feed on every drag tick.
export async function updateBudgetAssumedSpendPercent(budgetId: string, percent: number): Promise<{ error: string | null }> {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    return { error: "Percent must be a whole number between 0 and 100." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("budgets").update({ assumed_spend_percent: percent }).eq("id", budgetId);
  if (error) return { error: error.message };

  revalidatePath("/forecast");
  revalidatePath("/");
  revalidatePath("/budgets");
  return { error: null };
}
