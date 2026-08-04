"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatCentavos, parseCentavos } from "@/lib/money";
import { logActivity } from "@/lib/activityLog";

export type BalanceActionState = { error: string | null };

// T172: the fee field is optional - a blank input means "no fee" (0), not
// an error, unlike every other amount field in this app (which reads a
// blank as invalid via parseCentavos returning null). A negative value is
// still rejected, matching the DB's own `>= 0` check constraint.
function readTransactionFeeForm(formData: FormData): { error: string | null; fee: number } {
  const raw = ((formData.get("transactionFeePesos") as string) || "").trim();
  if (raw === "") return { error: null, fee: 0 };

  const parsed = parseCentavos(raw);
  if (parsed === null || parsed < 0) return { error: "Enter a valid transaction fee, or leave it blank.", fee: 0 };
  return { error: null, fee: parsed };
}

export async function createBalance(
  _prevState: BalanceActionState,
  formData: FormData,
): Promise<BalanceActionState> {
  const name = (formData.get("name") as string).trim();
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const comments = ((formData.get("comments") as string) || "").trim() || null;
  const feeFields = readTransactionFeeForm(formData);

  if (!name) return { error: "Name is required." };
  if (amount === null) return { error: "Enter a valid amount." };
  if (feeFields.error) return { error: feeFields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("balances").insert({
    user_id: user.id,
    name,
    amount,
    comments,
    transaction_fee_centavos: feeFields.fee,
  });
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, { action: "create", entityType: "account", entityName: name });

  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

// T186: no longer touches `amount` at all - editing an existing account's
// name/comments/fee is metadata, but the balance itself is now only ever
// changed through the logged addAccountFunds/takeAccountFunds/
// moveAccountFunds actions below, exactly what this task asked to stop
// being possible ("not just blindly update balances, so they are logged").
// `createBalance` above is untouched: setting an account's *starting*
// balance when it's first created isn't "updating" anything, so it isn't
// part of what needed to move onto the ledger.
export async function updateBalance(
  _prevState: BalanceActionState,
  formData: FormData,
): Promise<BalanceActionState> {
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string).trim();
  const comments = ((formData.get("comments") as string) || "").trim() || null;
  const feeFields = readTransactionFeeForm(formData);

  if (!name) return { error: "Name is required." };
  if (feeFields.error) return { error: feeFields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("balances")
    .update({ name, comments, transaction_fee_centavos: feeFields.fee })
    .eq("id", id);
  if (error) return { error: error.message };

  if (user) await logActivity(supabase, user.id, { action: "update", entityType: "account", entityName: name });

  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

// T186: Add funds / Take funds / Move funds - the logged replacement for
// directly editing an account's amount. Read-then-write, same style
// `applyToBalance` (forecast/actions.ts) already uses for settlements -
// acceptable non-transactional risk in this single-user/family app, same
// precedent.
function readFundsForm(formData: FormData) {
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const entryDate = formData.get("entryDate") as string;
  const note = ((formData.get("note") as string) || "").trim() || null;
  if (amount === null || amount <= 0) return { error: "Enter a valid amount." } as const;
  if (!entryDate) return { error: "Date is required." } as const;
  return { error: null, amount, entryDate, note } as const;
}

// User request 2026-08-04: a transaction fee field for Move funds,
// mirroring T194's exact pattern for the Settle form (forecast/actions.ts's
// `readSettleForm`) - blank means "use whatever the source account's own
// fee setting currently is," the same behavior as before this field
// existed; a typed value overrides it for this one move only.
function readFeeOverride(formData: FormData): { error: string | null; fee: number | null } {
  const raw = ((formData.get("feeAmountPesos") as string) || "").trim();
  if (raw === "") return { error: null, fee: null };

  const parsed = parseCentavos(raw);
  if (parsed === null || parsed < 0) return { error: "Enter a valid fee amount.", fee: null };
  return { error: null, fee: parsed };
}

async function adjustBalance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  balanceId: string,
  delta: number,
): Promise<string | null> {
  const { data: balance, error: fetchError } = await supabase
    .from("balances")
    .select("amount")
    .eq("id", balanceId)
    .single();
  if (fetchError) return fetchError.message;

  const { error: updateError } = await supabase
    .from("balances")
    .update({ amount: balance.amount + delta })
    .eq("id", balanceId);
  return updateError?.message ?? null;
}

export async function addAccountFunds(
  _prevState: BalanceActionState,
  formData: FormData,
): Promise<BalanceActionState> {
  const balanceId = formData.get("balanceId") as string;
  const balanceName = formData.get("balanceName") as string;
  const fields = readFundsForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const balanceError = await adjustBalance(supabase, balanceId, fields.amount);
  if (balanceError) return { error: balanceError };

  const { error } = await supabase.from("balance_transactions").insert({
    user_id: user.id,
    balance_id: balanceId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    direction: "incoming",
    note: fields.note,
  });
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "account",
    entityName: balanceName,
    detail: `Added funds: ${formatCentavos(fields.amount)}${fields.note ? ` (${fields.note})` : ""}`,
  });

  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function takeAccountFunds(
  _prevState: BalanceActionState,
  formData: FormData,
): Promise<BalanceActionState> {
  const balanceId = formData.get("balanceId") as string;
  const balanceName = formData.get("balanceName") as string;
  const fields = readFundsForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const balanceError = await adjustBalance(supabase, balanceId, -fields.amount);
  if (balanceError) return { error: balanceError };

  const { error } = await supabase.from("balance_transactions").insert({
    user_id: user.id,
    balance_id: balanceId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    direction: "outgoing",
    note: fields.note,
  });
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "account",
    entityName: balanceName,
    detail: `Took funds: ${formatCentavos(fields.amount)}${fields.note ? ` (${fields.note})` : ""}`,
  });

  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

// Two ledger rows, not a third "transfer" direction - each leg is a
// complete, independently-meaningful entry on its own account, the same
// way a transfer between two real bank accounts shows up as two separate
// lines on two separate statements.
export async function moveAccountFunds(
  _prevState: BalanceActionState,
  formData: FormData,
): Promise<BalanceActionState> {
  const fromId = formData.get("fromBalanceId") as string;
  const toId = formData.get("toBalanceId") as string;
  const fromName = formData.get("fromBalanceName") as string;
  const toName = formData.get("toBalanceName") as string;
  const fields = readFundsForm(formData);
  if (fields.error) return { error: fields.error };
  if (!toId) return { error: "Choose an account to move funds to." };
  if (fromId === toId) return { error: "Choose two different accounts." };
  const feeFields = readFeeOverride(formData);
  if (feeFields.error) return { error: feeFields.error };
  // User request 2026-08-04: a toggle for who actually bears the fee - the
  // sender pays extra on top of what they send (the original T186
  // behavior: receiver gets the full typed amount), or the receiver gets
  // less than what was sent (a "fee taken out in transit" model: sender's
  // account only ever changes by exactly the typed amount). Defaults to
  // "sender" so an older cached form (missing this field entirely) keeps
  // the original behavior.
  const feePaidBy = (formData.get("feePaidBy") as string) === "receiver" ? "receiver" : "sender";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Resolve the actual fee: an explicit override (this one move only), else
  // the source account's own configured fee (T172) - same "which account's
  // fee applies" convention as before, just now realized on whichever side
  // the toggle above says actually bears the cost.
  let fee: number;
  if (feeFields.fee !== null) {
    fee = feeFields.fee;
  } else {
    const { data: fromBalance, error: feeError } = await supabase
      .from("balances")
      .select("transaction_fee_centavos")
      .eq("id", fromId)
      .single();
    if (feeError) return { error: feeError.message };
    fee = fromBalance.transaction_fee_centavos ?? 0;
  }

  const fromDelta = feePaidBy === "sender" ? -(fields.amount + fee) : -fields.amount;
  const toDelta = feePaidBy === "receiver" ? fields.amount - fee : fields.amount;

  const fromError = await adjustBalance(supabase, fromId, fromDelta);
  if (fromError) return { error: fromError };
  const toError = await adjustBalance(supabase, toId, toDelta);
  if (toError) return { error: toError };

  const noteSuffix = fields.note ? ` (${fields.note})` : "";
  const { error: outError } = await supabase.from("balance_transactions").insert({
    user_id: user.id,
    balance_id: fromId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    direction: "outgoing",
    note: fields.note ?? `Moved to ${toName}`,
  });
  if (outError) return { error: outError.message };

  const { error: inError } = await supabase.from("balance_transactions").insert({
    user_id: user.id,
    balance_id: toId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    direction: "incoming",
    note: fields.note ?? `Moved from ${fromName}`,
  });
  if (inError) return { error: inError.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "account",
    entityName: fromName,
    detail: `Moved ${formatCentavos(fields.amount)} to ${toName}${noteSuffix}`,
  });

  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

export async function deleteBalance(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // .select() returns the deleted row in the same round trip (Postgres
  // RETURNING) - the plain-void delete actions across this app never fetched
  // a row first, so this is the cheapest way to get the name for the log
  // without a separate query.
  const { data: deleted } = await supabase.from("balances").delete().eq("id", id).select("name").single();
  if (user && deleted) {
    await logActivity(supabase, user.id, { action: "delete", entityType: "account", entityName: deleted.name });
  }
  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/");
}

// T71 (SPEC.md Phase 12): unlinks one connected item from its account,
// setting the item back to "no connected account" - the item itself is
// otherwise untouched. Revalidates every category page since a recurring
// item could be a bill/income/debt/savings and this action isn't told
// which.
export async function disconnectItem(formData: FormData) {
  const sourceType = formData.get("sourceType") as "recurring" | "one_off";
  const id = formData.get("id") as string;
  const table = sourceType === "recurring" ? "recurring_items" : "one_off_items";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Two literal `.select()` calls rather than one built from a variable -
  // Supabase's client parses the select string's shape at the type level,
  // which a runtime-computed string defeats (same reason toggleActive.ts
  // branches the same way).
  if (sourceType === "recurring") {
    const { data: updated } = await supabase
      .from(table)
      .update({ balance_id: null })
      .eq("id", id)
      .select("name, type")
      .single();
    if (user && updated) {
      await logActivity(supabase, user.id, {
        action: "update",
        entityType: updated.type as "bill" | "income" | "debt" | "savings",
        entityName: updated.name,
        detail: "Disconnected from its account",
      });
    }
  } else {
    const { data: updated } = await supabase
      .from(table)
      .update({ balance_id: null })
      .eq("id", id)
      .select("name")
      .single();
    if (user && updated) {
      await logActivity(supabase, user.id, {
        action: "update",
        entityType: "misc",
        entityName: updated.name,
        detail: "Disconnected from its account",
      });
    }
  }

  revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/bills");
  revalidatePath("/income");
  revalidatePath("/debt");
  revalidatePath("/savings");
  revalidatePath("/misc");
  revalidatePath("/");
}
