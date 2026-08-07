"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatCentavos, parseCentavos } from "@/lib/money";
import { formatFullDate, todayInManila } from "@/lib/date";
import { logActivity, type ActivityEntityType } from "@/lib/activityLog";
import { applyToBudgetAccount, loadBudgetAccountLinks } from "@/lib/budgetAccounts";
import { splitAmountByShares } from "@/lib/engine/budgetSplit";

// T162: maps a ForecastRow/settlement `type` ("bill"|"income"|"debt"|
// "savings"|"extra") onto the activity log's vocabulary - only "extra" needs
// translating, the same "misc" rename T106 already applies for display.
function activityEntityType(type: string): ActivityEntityType {
  return type === "extra" ? "misc" : (type as ActivityEntityType);
}

export type ForecastActionState = { error: string | null };

// User request 2026-07-24: the amount field shouldn't require typing a
// minus sign for outflow types - the sign is implied by the finance
// category (bill/debt/savings/budget negative, income positive), same
// convention every create/update form in the app already enforces via
// -Math.abs()/Math.abs(). "extra" is the one type that genuinely goes
// either way (no fixed direction), so its submitted sign is trusted as-is.
function normalizeSignedAmount(rawAmount: number, type: string): number {
  if (type === "extra") return rawAmount;
  const magnitude = Math.abs(rawAmount);
  return type === "income" ? magnitude : -magnitude;
}

// T107 (user request 2026-07-26): editing a forecast occurrence (this is
// always moving an *existing, still-upcoming* item - never creating a new
// one) can't push it into the past - only ever used by
// editRecurringOccurrence/editOneOff below, so this is unconditional, no
// opt-in flag needed (unlike the CRUD create/update forms, which share one
// helper between genuinely different create-vs-edit cases).
function readOccurrenceForm(formData: FormData) {
  const name = (formData.get("name") as string).trim();
  const type = formData.get("type") as string;
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const date = formData.get("date") as string;
  // T193 (user request): the connected account is editable from here too,
  // not only at settle time. Bug report 2026-08-03: T193 originally made
  // this a *permanent* change to the item's own `balance_id`, same field
  // its CRUD page edits - the user reported that as wrong ("editing an
  // account in the forecast page edits all of the future transactions...
  // it should just update for that specific forecasted transaction"). For a
  // recurring item this now goes into occurrence_overrides instead (see
  // editRecurringOccurrence below); a one-off item genuinely *is* its own
  // single occurrence (editOneOff below), so updating it directly is still
  // correct there.
  const balanceId = (formData.get("balanceId") as string) || null;

  if (!name) return { error: "Name is required." } as const;
  if (amount === null) return { error: "Enter a valid amount." } as const;
  if (!date) return { error: "Date is required." } as const;
  if (date < todayInManila()) return { error: "Date can't be in the past." } as const;

  return { error: null, name, amount: normalizeSignedAmount(amount, type), date, balanceId } as const;
}

export async function editRecurringOccurrence(
  _prevState: ForecastActionState,
  formData: FormData,
): Promise<ForecastActionState> {
  const recurringItemId = formData.get("sourceId") as string;
  const originalDate = formData.get("originalDate") as string;
  const type = formData.get("type") as string;
  const fields = readOccurrenceForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("occurrence_overrides").upsert(
    {
      user_id: user.id,
      recurring_item_id: recurringItemId,
      original_date: originalDate,
      new_date: fields.date,
      new_amount: fields.amount,
      new_name: fields.name,
      skipped: false,
      // Bug report 2026-08-03: this occurrence's account only, not the
      // item's own default - `balanceIdOverridden: true` always, even when
      // `fields.balanceId` is null ("No account" chosen for this one
      // occurrence), so the engine can tell that apart from an occurrence
      // that was never given an override at all (see forecast.ts).
      new_balance_id: fields.balanceId,
      balance_id_overridden: true,
    },
    { onConflict: "recurring_item_id,original_date" },
  );
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: activityEntityType(type),
    entityName: fields.name,
    detail: `Occurrence moved to ${formatFullDate(fields.date)}`,
  });

  revalidatePath("/forecast");
  revalidatePath("/accounts");
  revalidatePath("/");
  return { error: null };
}

export async function editOneOff(
  _prevState: ForecastActionState,
  formData: FormData,
): Promise<ForecastActionState> {
  const id = formData.get("sourceId") as string;
  const fields = readOccurrenceForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("one_off_items")
    .update({ name: fields.name, amount: fields.amount, due_date: fields.date, balance_id: fields.balanceId })
    .eq("id", id);
  if (error) return { error: error.message };

  if (user) {
    await logActivity(supabase, user.id, {
      action: "update",
      entityType: "misc",
      entityName: fields.name,
      detail: `Moved to ${formatFullDate(fields.date)}`,
    });
  }

  revalidatePath("/forecast");
  revalidatePath("/accounts");
  revalidatePath("/");
  revalidatePath("/misc");
  return { error: null };
}

// T107: settling something that hasn't happened yet doesn't make sense -
// shared by settleOccurrence and settleBudgetReplenish, both "settle"
// actions only, so this is unconditional too.
function readSettleForm(formData: FormData) {
  const actualAmount = parseCentavos(formData.get("actualAmountPesos") as string);
  const actualDate = formData.get("actualDate") as string;
  const balanceId = (formData.get("balanceId") as string) || null;
  // T194 (user request): the account fee is now a real, editable field for
  // this one settlement - blank means "use whatever the connected account's
  // own fee setting currently is," the same behavior as before this field
  // existed. Ignored by settleBudgetReplenish (it never touches a main
  // account at all), harmless since it just goes unread there.
  const feeAmountRaw = ((formData.get("feeAmountPesos") as string) || "").trim();
  const feeAmount = feeAmountRaw === "" ? null : parseCentavos(feeAmountRaw);
  if (feeAmountRaw !== "" && feeAmount === null) return { error: "Enter a valid fee amount." } as const;
  if (feeAmount !== null && feeAmount < 0) return { error: "Enter a valid fee amount." } as const;

  if (actualAmount === null) return { error: "Enter a valid actual amount." } as const;
  if (!actualDate) return { error: "Actual date is required." } as const;
  if (actualDate > todayInManila()) return { error: "Actual date can't be in the future." } as const;

  return { error: null, actualAmount, actualDate, balanceId, feeAmount } as const;
}

// T71 (SPEC.md Phase 12): applies a settlement's signed actual amount to its
// selected account - adds for income/incoming extras, subtracts for bills/
// debt/savings/outgoing extras, since actualAmount already carries the
// right sign for the item type (same convention the rest of the app uses).
// Fetch-then-update rather than an atomic increment, matching this app's
// existing non-transactional multi-step-write style (e.g. the linked-budget
// loop just below) - acceptable for a single-user/family app with no
// concurrent-write risk in practice.
//
// T172: also deducts the account's own transaction fee, if it has one. This
// is the one place real money moves for a settlement, so it's also the one
// place the fee has to actually leave the account - the Forecast's
// projected balance already included it (forecast.ts), and without this the
// real settled balance would end up higher than the forecast promised,
// exactly the kind of forecast-versus-reality drift T151/Bug #14 was about.
// Folded into this shared helper rather than handled by its one caller, so
// any future caller gets the same correctness for free.
async function applyToBalance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  balanceId: string,
  delta: number,
  // T194: an explicit fee for this one settlement, overriding the account's
  // own stored fee - null/omitted keeps the original behavior (use whatever
  // the account is currently set to).
  feeOverride?: number | null,
): Promise<string | null> {
  const { data: balance, error: fetchError } = await supabase
    .from("balances")
    .select("amount, transaction_fee_centavos")
    .eq("id", balanceId)
    .single();
  if (fetchError) return fetchError.message;

  const fee = feeOverride ?? balance.transaction_fee_centavos ?? 0;

  const { error: updateError } = await supabase
    .from("balances")
    .update({ amount: balance.amount + delta - fee })
    .eq("id", balanceId);
  return updateError?.message ?? null;
}

// T218: writes a budget's replenishment as one leg per connected account,
// splitting the settled amount proportional to each account's configured
// share (splitAmountByShares) - degenerates to exactly one leg, identical to
// pre-T218 behavior, when the budget has 0 or 1 connected accounts. Shared
// by settleOccurrence's income-linked branch and settleBudgetReplenish
// (own-schedule budgets) below, whose forecasted-amount sign conventions
// differ (see each call site), so both are passed in already correctly
// signed rather than negated here.
//
// T284: each leg now credits a real `balances` row via `applyToBudgetAccount`
// (repointed to `balances` by T284 - still no fee, this is bookkeeping
// against the user's own money, not an external settlement) - "the
// replenishment logic works like an auto-move," the same real-money-moves
// shape `income_auto_moves` already established. The income-linked branch's
// own source-side debit is unchanged (already netted in one write by
// settleOccurrence, T151/Bug #14, before this function is ever called) - an
// own-schedule budget still has no source account to debit at all.
async function writeBudgetReplenishLegs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  budgetId: string,
  budgetName: string,
  actualMagnitude: number,
  forecastedAmountSigned: number,
  entryDate: string,
  forecastedDate: string,
  forecastedBalance: number,
  noteLabel: string,
): Promise<string | null> {
  const links = await loadBudgetAccountLinks(supabase, budgetId);

  if (links.length <= 1) {
    const balanceId = links[0]?.balanceId ?? null;

    const { error: entryError } = await supabase.from("budget_entries").insert({
      user_id: userId,
      budget_id: budgetId,
      entry_date: entryDate,
      amount: actualMagnitude,
      note: noteLabel,
      direction: "incoming",
      balance_id: balanceId,
    });
    if (entryError) return entryError.message;

    if (balanceId && actualMagnitude > 0) {
      const accountError = await applyToBudgetAccount(supabase, balanceId, actualMagnitude);
      if (accountError) return accountError;
    }

    const { error: settlementError } = await supabase.from("settlements").insert({
      user_id: userId,
      source_type: "budget",
      source_id: budgetId,
      name: `${budgetName} - ${noteLabel}`,
      type: "budget",
      forecasted_amount: forecastedAmountSigned,
      actual_amount: -actualMagnitude,
      forecasted_date: forecastedDate,
      actual_date: entryDate,
      forecasted_balance: forecastedBalance,
      balance_id: balanceId,
    });
    return settlementError?.message ?? null;
  }

  const shares = links.map((link) => link.replenishAmount);
  const actualLegs = splitAmountByShares(actualMagnitude, shares);
  const forecastedLegs = splitAmountByShares(forecastedAmountSigned, shares);

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    // `budget_entries.amount` is DB-constrained to be strictly positive
    // (migration 0003) - a leg that rounds down to exactly 0 (a tiny total
    // split across several accounts) has to be skipped entirely rather than
    // written, since there's genuinely nothing to record for that account
    // this time.
    if (actualLegs[i] === 0) continue;
    const legNote = `${noteLabel} - ${link.name}`;

    const { error: entryError } = await supabase.from("budget_entries").insert({
      user_id: userId,
      budget_id: budgetId,
      entry_date: entryDate,
      amount: actualLegs[i],
      note: legNote,
      direction: "incoming",
      balance_id: link.balanceId,
    });
    if (entryError) return entryError.message;

    const accountError = await applyToBudgetAccount(supabase, link.balanceId, actualLegs[i]);
    if (accountError) return accountError;

    const { error: settlementError } = await supabase.from("settlements").insert({
      user_id: userId,
      source_type: "budget",
      source_id: budgetId,
      name: `${budgetName} - ${legNote}`,
      type: "budget",
      forecasted_amount: forecastedLegs[i],
      actual_amount: -actualLegs[i],
      forecasted_date: forecastedDate,
      actual_date: entryDate,
      forecasted_balance: forecastedBalance,
      balance_id: link.balanceId,
    });
    if (settlementError) return settlementError.message;
  }
  return null;
}

export async function settleOccurrence(
  _prevState: ForecastActionState,
  formData: FormData,
): Promise<ForecastActionState> {
  const sourceType = formData.get("sourceType") as "recurring" | "one_off";
  const sourceId = formData.get("sourceId") as string;
  const originalDate = formData.get("originalDate") as string;
  const name = formData.get("name") as string;
  const type = formData.get("type") as string;
  const forecastedAmount = Number(formData.get("forecastedAmount"));
  const forecastedDate = formData.get("forecastedDate") as string;
  const forecastedBalance = Number(formData.get("forecastedBalance"));

  const fields = readSettleForm(formData);
  if (fields.error) return { error: fields.error };
  const actualAmount = normalizeSignedAmount(fields.actualAmount, type);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error: settlementError } = await supabase.from("settlements").insert({
    user_id: user.id,
    source_type: sourceType,
    source_id: sourceId,
    name,
    type,
    forecasted_amount: forecastedAmount,
    actual_amount: actualAmount,
    forecasted_date: forecastedDate,
    actual_date: fields.actualDate,
    forecasted_balance: forecastedBalance,
    // T217: which main account this settlement actually moved.
    balance_id: fields.balanceId,
  });
  if (settlementError) return { error: settlementError.message };

  // T151 (Bug #14): budgets linked to this income have to be known *before*
  // the cash side is applied, because their allocations come out of the same
  // account the income lands in. Fetched here rather than in the loop further
  // down (which used to be the only place that knew about them) so the
  // account can be moved once, by the net figure.
  type LinkedBudget = { id: string; name: string; allocation: number };
  let linkedBudgets: LinkedBudget[] = [];
  // Bug #15: a budget's own per-instance override for *this exact
  // occurrence* - if the user edited this replenishment's amount from the
  // Forecast (T168, `budget_replenish_overrides.new_amount`), or it was
  // already settled/skipped some other way, settling the income must
  // respect that instead of blindly reapplying the budget's default
  // `allocation`. Read alongside `linkedBudgets` above (before the cash side
  // is touched) for the same reason T151 fetches budgets early - the net
  // figure applied to the account below has to already reflect it.
  const replenishOverrideByBudgetId = new Map<string, { newAmount: number | null; skipped: boolean }>();
  if (sourceType === "recurring" && type === "income") {
    const { data, error: linkedBudgetsError } = await supabase
      .from("budgets")
      .select("id, name, allocation")
      .eq("linked_income_id", sourceId);
    if (linkedBudgetsError) return { error: linkedBudgetsError.message };
    linkedBudgets = data ?? [];

    if (linkedBudgets.length > 0) {
      const { data: overrideRows, error: overridesError } = await supabase
        .from("budget_replenish_overrides")
        .select("budget_id, new_amount, skipped")
        .eq("original_date", originalDate)
        .in(
          "budget_id",
          linkedBudgets.map((b) => b.id),
        );
      if (overridesError) return { error: overridesError.message };
      for (const row of overrideRows ?? []) {
        replenishOverrideByBudgetId.set(row.budget_id, { newAmount: row.new_amount, skipped: row.skipped });
      }
    }
  }

  // null means "already handled for this occurrence, don't replenish again" -
  // the same "skip after settling" state `budget_replenish_overrides.skipped`
  // already carries for the forecast's own projection (forecast.ts).
  function replenishAmountFor(budget: LinkedBudget): number | null {
    const override = replenishOverrideByBudgetId.get(budget.id);
    if (override?.skipped) return null;
    return override?.newAmount ?? budget.allocation;
  }

  const totalAllocation = linkedBudgets.reduce((sum, budget) => sum + (replenishAmountFor(budget) ?? 0), 0);

  // T212: same "fetch before the cash side is touched, net it into one
  // write" reasoning as `linkedBudgets` above - an auto-move also comes out
  // of the same account the income lands in.
  type AutoMove = { id: string; destination_balance_id: string; amount: number };
  let autoMoves: AutoMove[] = [];
  // T224: this exact occurrence's own per-instance edit, if any - same
  // "read alongside the rule, before cash is touched" reasoning as
  // `replenishOverrideByBudgetId` above, and the same Bug #15 lesson: the
  // real transfer has to honor whatever the user edited this one date to,
  // not blindly reapply the rule's plain amount.
  const autoMoveOverrideById = new Map<string, { newAmount: number | null; skipped: boolean }>();
  if (sourceType === "recurring" && type === "income") {
    const { data, error: autoMovesError } = await supabase
      .from("income_auto_moves")
      .select("id, destination_balance_id, amount")
      .eq("income_id", sourceId);
    if (autoMovesError) return { error: autoMovesError.message };
    autoMoves = data ?? [];

    if (autoMoves.length > 0) {
      const { data: overrideRows, error: autoMoveOverridesError } = await supabase
        .from("income_auto_move_overrides")
        .select("income_auto_move_id, new_amount, skipped")
        .eq("original_date", originalDate)
        .in(
          "income_auto_move_id",
          autoMoves.map((m) => m.id),
        );
      if (autoMoveOverridesError) return { error: autoMoveOverridesError.message };
      for (const row of overrideRows ?? []) {
        autoMoveOverrideById.set(row.income_auto_move_id, { newAmount: row.new_amount, skipped: row.skipped });
      }
    }
  }

  // null means "skip this auto-move entirely for this occurrence" - the
  // user's own per-instance edit, not a "settle already handled it" marker
  // (an auto-move has no independent settle path of its own to mark).
  function autoMoveAmountFor(autoMove: AutoMove): number | null {
    const override = autoMoveOverrideById.get(autoMove.id);
    if (override?.skipped) return null;
    return override?.newAmount ?? autoMove.amount;
  }

  const totalAutoMove = autoMoves.reduce((sum, autoMove) => sum + (autoMoveAmountFor(autoMove) ?? 0), 0);

  // T71 (SPEC.md Phase 12): if an account is selected (pre-filled from the
  // item's own linked balance, but overridable per-settlement), apply the
  // actual amount to it - this is the one moment money really moves, so it's
  // the only place a balance gets touched (editing/deleting a past
  // settlement deliberately does not retro-adjust it).
  //
  // T151 (Bug #14): net of any linked budget allocations. Settling a ₱20,000
  // income that feeds a ₱1,000 budget used to put the full ₱20,000 in the
  // account *and* ₱1,000 in the budget - the same ₱1,000 counted twice, and
  // ₱1,000 more than the Forecast had projected, since T59 already shows the
  // replenishment as a real deduction before it is settled. Applying the net
  // in a single read-modify-write rather than an income credit followed by
  // per-budget debits: `applyToBalance` reads then writes, so each extra call
  // is another chance for two settles to interleave and lose an update.
  //
  // Deliberately allowed to go negative when allocations exceed the income -
  // that matches both the projection and the ledger model, which lets a
  // budget go negative rather than clamping.
  if (fields.balanceId) {
    const balanceError = await applyToBalance(
      supabase,
      fields.balanceId,
      actualAmount - totalAllocation - totalAutoMove,
      fields.feeAmount,
    );
    if (balanceError) return { error: balanceError };
  }

  await logActivity(supabase, user.id, {
    action: "settle",
    entityType: activityEntityType(type),
    entityName: name,
    detail: `${formatCentavos(actualAmount)} on ${formatFullDate(fields.actualDate)}`,
  });

  // T212: the source side's balance change is already folded into the net
  // write above (same reasoning as budget allocations) - this only credits
  // each destination account and logs both legs to balance_transactions, the
  // same two-leg shape a manual Move funds (T186) already writes, so both
  // accounts' own History view shows where the money came from/went.
  if (fields.balanceId && autoMoves.length > 0) {
    const { data: sourceBalance, error: sourceBalanceError } = await supabase
      .from("balances")
      .select("name")
      .eq("id", fields.balanceId)
      .single();
    if (sourceBalanceError) return { error: sourceBalanceError.message };

    for (const autoMove of autoMoves) {
      // T224: an occurrence the user explicitly skipped moves no money and
      // writes no legs at all - same "leave it alone entirely" treatment
      // Bug #15's fix gave a skipped budget replenishment.
      const amount = autoMoveAmountFor(autoMove);
      if (amount === null) continue;

      const { data: destBalance, error: destFetchError } = await supabase
        .from("balances")
        .select("amount, name")
        .eq("id", autoMove.destination_balance_id)
        .single();
      if (destFetchError) return { error: destFetchError.message };

      const { error: destUpdateError } = await supabase
        .from("balances")
        .update({ amount: destBalance.amount + amount })
        .eq("id", autoMove.destination_balance_id);
      if (destUpdateError) return { error: destUpdateError.message };

      const { error: outLegError } = await supabase.from("balance_transactions").insert({
        user_id: user.id,
        balance_id: fields.balanceId,
        entry_date: fields.actualDate,
        amount,
        direction: "outgoing",
        note: `Auto-moved to ${destBalance.name}`,
      });
      if (outLegError) return { error: outLegError.message };

      const { error: inLegError } = await supabase.from("balance_transactions").insert({
        user_id: user.id,
        balance_id: autoMove.destination_balance_id,
        entry_date: fields.actualDate,
        amount,
        direction: "incoming",
        note: `Auto-moved from ${sourceBalance.name} (${name} settling)`,
      });
      if (inLegError) return { error: inLegError.message };
    }

    // T224: no log line at all when every auto-move for this occurrence was
    // skipped - same "a skipped thing leaves no trace" precedent the linked-
    // budget loop below already follows (a skipped budget logs nothing
    // either), rather than a misleading "Auto-moved ₱0.00".
    if (totalAutoMove > 0) {
      await logActivity(supabase, user.id, {
        action: "update",
        entityType: "account",
        entityName: sourceBalance.name,
        detail: `Auto-moved ${formatCentavos(totalAutoMove)} on settling ${name}`,
      });
    }
  }

  if (sourceType === "recurring") {
    const { error } = await supabase.from("occurrence_overrides").upsert(
      {
        user_id: user.id,
        recurring_item_id: sourceId,
        original_date: originalDate,
        new_date: null,
        new_amount: null,
        new_name: null,
        skipped: true,
        new_balance_id: null,
        balance_id_overridden: false,
      },
      { onConflict: "recurring_item_id,original_date" },
    );
    if (error) return { error: error.message };

    // Budget replenishment (SPEC.md T56, cash-effect added by T59): settling
    // an income occurrence is the trigger - any budget linked to this income
    // gets its allocation added as a fresh incoming ledger entry, dated at
    // the actual settle date rather than the forecasted one (the money
    // really landed then). Phase 11 (T59): the Forecast now shows this as a
    // real projected deduction *before* it's settled (see forecast.ts's
    // incomeEffectiveOccurrences), so settling it writes a real cash-side
    // settlement leg too (actual_amount negative, mirroring the projected
    // row) and marks the occurrence handled in budget_replenish_overrides so
    // it stops re-projecting - the same "skip after settling" pattern
    // occurrence_overrides already uses for the income itself, just above.
    //
    // T151 (Bug #14): `linkedBudgets` is now fetched further up, before the
    // cash side is applied, so the account can be moved by the net figure in
    // one write. The settlement row below records `actual_amount: -amount`,
    // which until T151 described a cash movement that never actually
    // happened; it is now true.
    //
    // Bug #15: uses `replenishAmountFor` (defaulting to the budget's plain
    // `allocation` only when there's no per-instance override) rather than
    // `linkedBudget.allocation` directly - the previous version always used
    // the default, silently discarding an edited occurrence amount at the
    // exact moment it was supposed to take effect. A budget already marked
    // `skipped` for this occurrence (settled/skipped some other way) is left
    // alone entirely, so this can't double-replenish it.
    if (type === "income") {
      for (const linkedBudget of linkedBudgets) {
        const amount = replenishAmountFor(linkedBudget);
        if (amount === null) continue;
        const replenishNote = `Replenished from ${name}`;

        // T204/T218: writes one leg per connected budget account (0 or 1
        // connected: the same single-row behavior as before T218), splitting
        // `amount` proportional to each account's configured share.
        const legsError = await writeBudgetReplenishLegs(
          supabase,
          user.id,
          linkedBudget.id,
          linkedBudget.name,
          amount,
          -amount,
          fields.actualDate,
          originalDate,
          0,
          replenishNote,
        );
        if (legsError) return { error: legsError };

        const { error: replenishOverrideError } = await supabase.from("budget_replenish_overrides").upsert(
          {
            user_id: user.id,
            budget_id: linkedBudget.id,
            original_date: originalDate,
            skipped: true,
          },
          { onConflict: "budget_id,original_date" },
        );
        if (replenishOverrideError) return { error: replenishOverrideError.message };

        await logActivity(supabase, user.id, {
          action: "create",
          entityType: "budget_entry",
          entityName: linkedBudget.name,
          detail: `Replenished: ${formatCentavos(amount)}`,
        });
      }
      if (linkedBudgets.length > 0) revalidatePath("/budgets");
    }
  } else {
    const { error } = await supabase.from("one_off_items").delete().eq("id", sourceId);
    if (error) return { error: error.message };
    revalidatePath("/misc");
  }

  if (fields.balanceId) revalidatePath("/accounts");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

// T168 (user request 2026-07-31): adjust a single projected replenishment
// without touching the budget's allocation or its schedule - "only 8,000 into
// this budget this month", or "I need it a week earlier". Deliberately the
// same shape as editRecurringOccurrence above, writing to the same kind of
// per-instance override table (budget_replenish_overrides, extended with
// new_date/new_amount by migration 0027).
//
// Two differences from the recurring-item editor, both from what a budget row
// actually is: there is no name to edit (the row is named after its budget),
// and the amount is a positive magnitude like `budgets.allocation` rather than
// a signed value - the forecast negates it for display, so storing a negative
// here would double-negate.
export async function editBudgetReplenish(
  _prevState: ForecastActionState,
  formData: FormData,
): Promise<ForecastActionState> {
  const budgetId = formData.get("budgetId") as string;
  const budgetName = formData.get("budgetName") as string;
  const originalDate = formData.get("originalDate") as string;
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const date = formData.get("date") as string;

  // T192 (user request): 0 is a valid amount - only negative or unparseable
  // is rejected.
  if (amount === null || amount < 0) return { error: "Enter a valid amount." };
  if (!date) return { error: "Date is required." };
  if (date < todayInManila()) return { error: "Date can't be in the past." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("budget_replenish_overrides").upsert(
    {
      user_id: user.id,
      budget_id: budgetId,
      original_date: originalDate,
      new_date: date,
      new_amount: amount,
      // `skipped` defaults to true in the table (migration 0011, written for
      // the settle path), so an edit has to say otherwise explicitly -
      // without this the row would vanish from the forecast instead of
      // changing.
      skipped: false,
    },
    { onConflict: "budget_id,original_date" },
  );
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "budget",
    entityName: budgetName,
    detail: `Replenishment adjusted to ${formatCentavos(amount)} on ${formatFullDate(date)}`,
  });

  revalidatePath("/forecast");
  revalidatePath("/budgets");
  revalidatePath("/");
  return { error: null };
}

// T168: drops a per-instance edit, putting the occurrence back on its
// scheduled date and the budget's own allocation. Deleting the row rather
// than nulling the columns, so an un-edited occurrence has no override row at
// all - the same end state it had before it was ever edited.
export async function resetBudgetReplenish(
  _prevState: ForecastActionState,
  formData: FormData,
): Promise<ForecastActionState> {
  const budgetId = formData.get("budgetId") as string;
  const budgetName = formData.get("budgetName") as string;
  const originalDate = formData.get("originalDate") as string;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("budget_replenish_overrides")
    .delete()
    .eq("budget_id", budgetId)
    .eq("original_date", originalDate)
    .eq("skipped", false);
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "budget",
    entityName: budgetName,
    detail: "Replenishment edit reset to its usual amount and date",
  });

  revalidatePath("/forecast");
  revalidatePath("/budgets");
  revalidatePath("/");
  return { error: null };
}

// SPEC.md T224 (user request 2026-08-02): adjust a single projected
// income-auto-move occurrence - reduce it, move it, or skip it outright -
// without touching the recurring rule (income_auto_moves) it comes from.
// Deliberately the same shape as editBudgetReplenish above, writing to the
// same kind of per-instance override table
// (income_auto_move_overrides, migration 0049).
//
// One difference from that editor: a checked "skip this date" box is a
// first-class outcome here, not a separate action - an auto-move has no
// independent settle button to mark itself done with later, so skipping is
// just another value this same override can hold, validated before amount/
// date rather than alongside them.
export async function editIncomeAutoMove(
  _prevState: ForecastActionState,
  formData: FormData,
): Promise<ForecastActionState> {
  const incomeAutoMoveId = formData.get("incomeAutoMoveId") as string;
  const originalDate = formData.get("originalDate") as string;
  const skip = formData.get("skip") === "on";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  if (skip) {
    const { error } = await supabase.from("income_auto_move_overrides").upsert(
      {
        user_id: user.id,
        income_auto_move_id: incomeAutoMoveId,
        original_date: originalDate,
        skipped: true,
        new_date: null,
        new_amount: null,
      },
      { onConflict: "income_auto_move_id,original_date" },
    );
    if (error) return { error: error.message };

    await logActivity(supabase, user.id, {
      action: "update",
      entityType: "account",
      entityName: "Auto-move",
      detail: `Skipped the auto-move on ${formatFullDate(originalDate)}`,
    });

    revalidatePath("/forecast");
    revalidatePath("/");
    return { error: null };
  }

  const amount = parseCentavos(formData.get("amountPesos") as string);
  const date = formData.get("date") as string;

  // T192-style rule: 0 is a valid amount - only negative or unparseable is
  // rejected.
  if (amount === null || amount < 0) return { error: "Enter a valid amount." };
  if (!date) return { error: "Date is required." };
  if (date < todayInManila()) return { error: "Date can't be in the past." };

  const { error } = await supabase.from("income_auto_move_overrides").upsert(
    {
      user_id: user.id,
      income_auto_move_id: incomeAutoMoveId,
      original_date: originalDate,
      new_date: date,
      new_amount: amount,
      skipped: false,
    },
    { onConflict: "income_auto_move_id,original_date" },
  );
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "account",
    entityName: "Auto-move",
    detail: `Auto-move on ${formatFullDate(originalDate)} adjusted to ${formatCentavos(amount)} on ${formatFullDate(date)}`,
  });

  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

// T224: drops a per-instance edit (or skip), putting the occurrence back on
// its rule's plain amount and the income's own effective date. Deleting the
// row rather than nulling its columns, so an un-edited occurrence has no
// override row at all - the same end state it had before it was ever
// touched, mirroring resetBudgetReplenish above. No `.eq("skipped", false)`
// guard here - unlike budget_replenish_overrides, this table's `skipped`
// never doubles as a "settle already handled it" marker, so there's no
// second meaning a plain delete could clobber.
export async function resetIncomeAutoMove(
  _prevState: ForecastActionState,
  formData: FormData,
): Promise<ForecastActionState> {
  const incomeAutoMoveId = formData.get("incomeAutoMoveId") as string;
  const originalDate = formData.get("originalDate") as string;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("income_auto_move_overrides")
    .delete()
    .eq("income_auto_move_id", incomeAutoMoveId)
    .eq("original_date", originalDate);
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "account",
    entityName: "Auto-move",
    detail: `Auto-move edit on ${formatFullDate(originalDate)} reset to its usual amount and date`,
  });

  revalidatePath("/forecast");
  revalidatePath("/");
  return { error: null };
}

// Phase 11 (SPEC.md T59): settles a projected replenish occurrence for a
// budget on its own schedule ("replenish every", no linked income - those
// auto-settle via settleOccurrence's income branch above instead, since
// that's the one moment the transfer actually happens). Bill-like: writes
// a real cash-side settlement (negative, matching the projected row) and
// the budget's incoming ledger entry, then marks the occurrence handled in
// budget_replenish_overrides so it stops re-projecting.
export async function settleBudgetReplenish(
  _prevState: ForecastActionState,
  formData: FormData,
): Promise<ForecastActionState> {
  const budgetId = formData.get("budgetId") as string;
  const budgetName = formData.get("budgetName") as string;
  const originalDate = formData.get("originalDate") as string;
  const forecastedAmount = Number(formData.get("forecastedAmount"));
  const forecastedDate = formData.get("forecastedDate") as string;
  const forecastedBalance = Number(formData.get("forecastedBalance"));

  const fields = readSettleForm(formData);
  if (fields.error) return { error: fields.error };
  // budget_entries.amount is always a positive magnitude (direction carries
  // the sign) - unlike a bill/income occurrence, a replenishment can't
  // settle for a negative amount. T192 (user request): 0 is now allowed -
  // e.g. a period where nothing was actually replenished.
  if (fields.actualAmount < 0) return { error: "Enter a valid actual amount." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // T204/T218: writes one leg per connected budget account (0 or 1
  // connected: the same single-row behavior as before T218), splitting the
  // settled amount proportional to each account's configured share.
  const legsError = await writeBudgetReplenishLegs(
    supabase,
    user.id,
    budgetId,
    budgetName,
    fields.actualAmount,
    forecastedAmount,
    fields.actualDate,
    forecastedDate,
    forecastedBalance,
    "Replenished",
  );
  if (legsError) return { error: legsError };

  const { error: overrideError } = await supabase.from("budget_replenish_overrides").upsert(
    {
      user_id: user.id,
      budget_id: budgetId,
      original_date: originalDate,
      skipped: true,
    },
    { onConflict: "budget_id,original_date" },
  );
  if (overrideError) return { error: overrideError.message };

  await logActivity(supabase, user.id, {
    action: "settle",
    entityType: "budget",
    entityName: budgetName,
    detail: `Replenished: ${formatCentavos(fields.actualAmount)} on ${formatFullDate(fields.actualDate)}`,
  });

  revalidatePath("/forecast");
  revalidatePath("/budgets");
  revalidatePath("/");
  return { error: null };
}
