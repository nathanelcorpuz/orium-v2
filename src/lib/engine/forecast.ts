import type {
  BudgetBalanceLink,
  BudgetReplenishOverride,
  ForecastRow,
  GenerateForecastInput,
  IncomeAutoMoveOverride,
  OccurrenceOverride,
  RecurrenceRule,
  RecurringItem,
} from "./types";
import { expandRecurrenceOccurrences } from "./recurrence";
import { budgetReplenishRule, futureBudgetLedgerEntries, futureBudgetReplenishDates } from "./budgetLedger";
import { splitAmountByShares } from "./budgetSplit";

function toRecurrenceRule(item: RecurringItem): RecurrenceRule {
  return {
    startDate: item.startDate,
    interval: item.interval,
    unit: item.unit,
    weekdays: item.weekdays,
    daysOfMonth: item.daysOfMonth,
    ordinal: item.ordinal,
    ordinalWeekday: item.ordinalWeekday,
    endsType: item.endsType,
    endDate: item.endDate,
    occurrenceCount: item.occurrenceCount,
  };
}

function overrideKey(recurringItemId: string, originalDate: string): string {
  return `${recurringItemId}|${originalDate}`;
}

function budgetOverrideKey(budgetId: string, originalDate: string): string {
  return `${budgetId}|${originalDate}`;
}

function autoMoveOverrideKey(incomeAutoMoveId: string, originalDate: string): string {
  return `${incomeAutoMoveId}|${originalDate}`;
}

export function generateForecast(input: GenerateForecastInput): ForecastRow[] {
  const { balances, recurringItems, overrides, oneOffs, today, horizon } = input;
  const budgets = input.budgets ?? [];
  const budgetEntries = input.budgetEntries ?? [];
  const budgetReplenishOverrides = input.budgetReplenishOverrides ?? [];

  // T172: looked up once per account rather than per row - a fee is a
  // property of the account, not the transaction, and every row connected to
  // the same account shares it.
  const feeByBalanceId = new Map<string, number>();
  for (const balance of balances) {
    if (balance.transactionFeeCentavos) feeByBalanceId.set(balance.id, balance.transactionFeeCentavos);
  }

  const overridesByKey = new Map<string, OccurrenceOverride>();
  for (const override of overrides) {
    overridesByKey.set(overrideKey(override.recurringItemId, override.originalDate), override);
  }

  const budgetReplenishOverridesByKey = new Map<string, BudgetReplenishOverride>();
  for (const override of budgetReplenishOverrides) {
    budgetReplenishOverridesByKey.set(budgetOverrideKey(override.budgetId, override.originalDate), override);
  }

  // T224: per-occurrence edits to an income auto-move, mirroring
  // budgetReplenishOverridesByKey immediately above.
  const autoMoveOverrides = input.incomeAutoMoveOverrides ?? [];
  const autoMoveOverridesByKey = new Map<string, IncomeAutoMoveOverride>();
  for (const override of autoMoveOverrides) {
    autoMoveOverridesByKey.set(autoMoveOverrideKey(override.incomeAutoMoveId, override.originalDate), override);
  }

  // T191 (user request): an income-linked budget's replenishment is real
  // money leaving *that income's own connected account* - settleOccurrence
  // already applies it that way (`actualAmount - totalAllocation` in one
  // write to the income's account, T151/Bug #14) - so the projected
  // budget_replenish row should carry that same account as its `balanceId`,
  // not go unattributed. Looked up by id once here rather than re-scanning
  // `recurringItems` per budget below.
  const balanceIdByRecurringItemId = new Map(recurringItems.map((item) => [item.id, item.balanceId]));

  // T284: every real account, and every budget's configured link(s) to one -
  // both needed inside the budget loop below (to credit a replenishment's
  // destination account(s)) as well as by the income-auto-move loop further
  // down, so both are resolved once, up front.
  const balanceById = new Map(balances.map((balance) => [balance.id, balance]));
  const budgetBalanceLinksByBudgetId = new Map<string, BudgetBalanceLink[]>();
  for (const link of input.budgetBalanceLinks ?? []) {
    const list = budgetBalanceLinksByBudgetId.get(link.budgetId) ?? [];
    list.push(link);
    budgetBalanceLinksByBudgetId.set(link.budgetId, list);
  }

  const rows: Omit<ForecastRow, "runningBalance">[] = [];

  // Phase 11 (T59): an income's *effective* (override-applied, non-skipped)
  // occurrence dates, keyed by income id - a budget linked to this income
  // replenishes on these same dates (a moved income occurrence moves the
  // linked budget's deduction with it; a skipped one skips the deduction
  // too), mirroring how the old Phase 6B cycle model sourced its boundaries
  // from "the income's effective occurrence dates" rather than its raw
  // schedule. originalDate is kept alongside effectiveDate so the budget's
  // own override (below) stays keyed the same stable way settleOccurrence
  // already keys the income's own occurrence_overrides.
  const incomeEffectiveOccurrences = new Map<string, { originalDate: string; effectiveDate: string }[]>();

  // T175: a disabled item is excluded at the very top of expansion, before
  // recurrence, overrides, budget replenishment or the running balance run.
  // Filtering here rather than at each downstream calculation means every one
  // of them - Peaks and Drops, lowest balance, past-due, and the replenish
  // dates a budget borrows from its linked income - stays automatically
  // consistent, with no separate exclusion logic to keep in sync.
  //
  // Compared against `false` explicitly rather than tested for falsiness, so
  // an undefined value (older fixtures, and the DB default) means active.
  const activeRecurringItems = recurringItems.filter((item) => item.active !== false);
  const activeOneOffs = oneOffs.filter((oneOff) => oneOff.active !== false);

  for (const item of activeRecurringItems) {
    // T150 (Bug #11): expand from the rule's own start date, not from today.
    // Occurrences before today used to be dropped on the assumption that
    // anything in the past had already been settled - production use showed
    // that assumption is exactly backwards, since an occurrence the user
    // never settled is the one that most needs showing. Settling writes a
    // `skipped` override, so a diligent user sees no extra rows here; what
    // survives is genuinely outstanding. The user chose an unbounded
    // lookback (2026-07-31) over a fixed window, so this walks the whole
    // rule. `expandRecurrenceOccurrences` already ignores candidates before
    // `rule.startDate`, and counts `after_count` from the start regardless
    // of the window, so widening the window changes which dates are
    // returned but not which occurrences the rule considers to exist.
    for (const date of expandRecurrenceOccurrences(toRecurrenceRule(item), item.startDate, horizon)) {
      const override = overridesByKey.get(overrideKey(item.id, date));
      if (override?.skipped) continue;

      const effectiveDate = override?.newDate ?? date;
      // Bug report 2026-08-03: editing an occurrence's connected account
      // used to permanently rewrite the item's own `balanceId` (T193) -
      // reversed, this now applies only when the override explicitly set
      // one (`balanceIdOverridden`), same "null can mean two different
      // things" care every other per-occurrence override field already
      // needed.
      const effectiveBalanceId = override?.balanceIdOverridden ? override.newBalanceId : item.balanceId;

      rows.push({
        sourceType: "recurring",
        sourceId: item.id,
        originalDate: date,
        name: override?.newName ?? item.name,
        amount: override?.newAmount ?? item.amount,
        dueDate: effectiveDate,
        type: item.type,
        edited: override ? true : undefined,
        balanceId: effectiveBalanceId ?? undefined,
        // T155: pass-through only - the engine never reads it. Empty strings
        // collapse to undefined so a blank comment doesn't render an
        // indicator with nothing behind it.
        comment: item.comments?.trim() ? item.comments : undefined,
        // T172: looked up from whichever account this occurrence actually
        // connects to - the override, if this occurrence has one.
        feeAmount: effectiveBalanceId ? feeByBalanceId.get(effectiveBalanceId) : undefined,
        // T174: pass-through only, same as `comments`/`active` above.
        fromScenario: item.fromScenario,
      });

      if (item.type === "income") {
        const list = incomeEffectiveOccurrences.get(item.id) ?? [];
        list.push({ originalDate: date, effectiveDate });
        incomeEffectiveOccurrences.set(item.id, list);
      }
    }
  }

  for (const oneOff of activeOneOffs) {
    // T150 (Bug #11): past-dated one-offs are kept too. This is the exact
    // case the user reported - a Jul 29 Misc payment that vanished on Jul 30,
    // taking a real Sep 1 negative balance with it. Settling a one-off
    // deletes its row outright (settleOccurrence), so anything still here
    // genuinely hasn't been dealt with.
    rows.push({
      sourceType: "one_off",
      sourceId: oneOff.id,
      originalDate: oneOff.dueDate,
      name: oneOff.name,
      amount: oneOff.amount,
      dueDate: oneOff.dueDate,
      type: "extra",
      balanceId: oneOff.balanceId ?? undefined,
      comment: oneOff.comments?.trim() ? oneOff.comments : undefined,
      feeAmount: oneOff.balanceId ? feeByBalanceId.get(oneOff.balanceId) : undefined,
      fromScenario: oneOff.fromScenario,
    });
  }

  // SPEC.md Phase 10 (T57) + Phase 11 (T59): a budget is a running ledger,
  // not a cycle - real ledger entries (spends, manual add/take, settled
  // replenishments) show up on their own actual date via
  // futureBudgetLedgerEntries below, named to match the settlement-naming
  // convention logSpend/updateBudgetEntry/writeLedgerEntry already use
  // (budgets/actions.ts); amount follows direction (incoming positive,
  // outgoing negative) - undirected (pre-Phase-10) entries default to
  // outgoing. Phase 11 adds one more kind of row above the ledger-entry
  // loop: a *projected* future replenish deduction, for whichever
  // occurrences haven't been settled/skipped yet (budget_replenish_overrides).
  // T175: a disabled budget contributes nothing to the forecast - neither
  // projected replenishments nor future-dated ledger entries. Its own running
  // total on the Budgets page is deliberately untouched: that is a record of
  // money already moved, not a projection, so hiding it would misstate history.
  for (const budget of budgets.filter((b) => b.active !== false)) {
    // Phase 11 (T59): a real projected deduction on every future,
    // not-yet-settled/skipped replenish occurrence - a bill-like row, not
    // the old cycle model's soft reservation. Income-linked budgets use the
    // linked income's own effective occurrence dates (computed above,
    // already override-aware); own-schedule ("replenish every") budgets
    // resolve their own rule directly, since they have no income to borrow
    // dates from.
    const replenishOccurrences: { originalDate: string; effectiveDate: string }[] =
      budget.linkedIncomeId !== null
        ? (incomeEffectiveOccurrences.get(budget.linkedIncomeId) ?? [])
        : (() => {
            // T150: same unbounded lookback as recurring items. An
            // own-schedule budget's replenish row is independently
            // settleable (`budgetSettleable` below), so a missed one can
            // actually be cleared rather than being stuck in the list
            // forever. Income-linked budgets need no equivalent change -
            // they borrow the income's occurrence dates, which now already
            // include past ones, and clear when that income is settled.
            const rule = budgetReplenishRule(budget, null);
            return futureBudgetReplenishDates(rule, rule?.startDate ?? today, horizon).map((date) => ({
              originalDate: date,
              effectiveDate: date,
            }));
          })();

    for (const { originalDate, effectiveDate } of replenishOccurrences) {
      const override = budgetReplenishOverridesByKey.get(budgetOverrideKey(budget.id, originalDate));
      if (override?.skipped) continue;

      // T168: per-instance edits, applied exactly the way recurring-item
      // overrides are handled in the loop above. `newAmount` is stored as a
      // positive magnitude (same convention as `budget.allocation`), so the
      // negation happens here rather than at the storage layer. Each field
      // is independent: moving an occurrence must not reset its amount.
      const editedAmount = override?.newAmount ?? null;
      const editedDate = override?.newDate ?? null;

      rows.push({
        sourceType: "budget_replenish",
        sourceId: budget.id,
        originalDate,
        name: budget.name,
        amount: -(editedAmount ?? budget.allocation),
        // An income-linked budget's date already tracks its income's own
        // overrides (`effectiveDate`); an explicit edit here wins over that,
        // since the user set it on this row directly.
        dueDate: editedDate ?? effectiveDate,
        type: "budget",
        budgetId: budget.id,
        budgetName: budget.name,
        budgetSettleable: budget.linkedIncomeId === null ? true : undefined,
        edited: editedAmount !== null || editedDate !== null ? true : undefined,
        // T191: an own-schedule budget (no linked income) isn't funded from
        // any particular account in this model - it stays unattributed,
        // same as before. `?? undefined` covers both "no linked income" and
        // "linked income has no connected account of its own".
        balanceId: budget.linkedIncomeId ? (balanceIdByRecurringItemId.get(budget.linkedIncomeId) ?? undefined) : undefined,
        // Deliberately no `feeAmount` here even when the line above resolves
        // an account with its own fee - the income row occurring alongside
        // this one already carries that account's fee (T172), and
        // `settleOccurrence` only ever deducts it once, in the same single
        // net write that applies this allocation (T151/Bug #14). Charging it
        // again here would double it, in projection only, the same class of
        // forecast-versus-reality drift Bug #14 was about.
        // T182: pass-through, same as recurring/one-off rows (T174) - lets
        // the UI badge it and (via the existing fromScenario click-guards
        // already in ForecastClient/CalendarGrid) keeps it unclickable,
        // since its sourceId is a scenario_budgets id, not a real budgets one.
        fromScenario: budget.fromScenario,
      });

      // T284: a replenishment now credits its linked account(s) for real
      // (SPEC.md Phase 49 - "replenishment works like an auto-move"), so the
      // destination's own projected balance (accountBalances.ts) reflects it
      // ahead of settle time, the same way `income_auto_moves` already does.
      // Split proportional to each link's configured share, same math the
      // real settle-time write uses (writeBudgetReplenishLegs,
      // forecast/actions.ts). Hidden - like an auto-move leg, this isn't a
      // second transaction the user did, it's the other half of the row just
      // pushed above. No explicit zero-contribution treatment: an
      // income-linked replenishment's debit (above) and credit(s) (here)
      // naturally net to the same combined total either way, and an
      // own-schedule budget's credit is genuinely new money (no debit exists
      // to net against) - see SPEC.md T284 write-up for the reasoning.
      const links = budgetBalanceLinksByBudgetId.get(budget.id) ?? [];
      if (links.length > 0) {
        const totalAmount = editedAmount ?? budget.allocation;
        const splitAmounts = splitAmountByShares(
          totalAmount,
          links.map((link) => link.replenishAmount),
        );
        links.forEach((link, i) => {
          const destination = balanceById.get(link.balanceId);
          const creditAmount = splitAmounts[i];
          if (!destination || creditAmount <= 0) return;
          rows.push({
            sourceType: "budget_replenish",
            sourceId: budget.id,
            originalDate,
            name: `${budget.name} replenishment`,
            amount: creditAmount,
            dueDate: editedDate ?? effectiveDate,
            type: "budget",
            budgetId: budget.id,
            budgetName: budget.name,
            balanceId: link.balanceId,
            hidden: true,
          });
        });
      }
    }

    for (const futureEntry of futureBudgetLedgerEntries(budgetEntries, budget.id, today)) {
      rows.push({
        sourceType: "budget_entry",
        sourceId: futureEntry.id,
        originalDate: futureEntry.entryDate,
        name: futureEntry.note ? `${budget.name} - ${futureEntry.note}` : budget.name,
        amount: futureEntry.direction === "incoming" ? futureEntry.amount : -futureEntry.amount,
        dueDate: futureEntry.entryDate,
        type: "budget",
        budgetId: budget.id,
        budgetName: budget.name,
        note: futureEntry.note,
        // T284: which real account this ledger entry actually touched, when
        // it has one - lets a future-dated manual add/take/spend against a
        // budget-linked account be excluded by "Cash Flow Only"
        // (cashFlowFilter.ts) the same uniform way any other row is.
        balanceId: futureEntry.balanceId ?? undefined,
        fromScenario: budget.fromScenario,
      });
    }
  }

  // SPEC.md T212 (user request 2026-08-01): a projected settle-time transfer
  // out of an income's own connected account, into another main account -
  // always generated as a pair (one outgoing on the source, one incoming on
  // the destination), the same way settling it for real will write two
  // balance_transactions legs (settleOccurrence, forecast/actions.ts). Uses
  // the income's own *effective* occurrence dates (computed above, already
  // override-aware) - a moved or skipped income occurrence moves or skips
  // its auto-moves with it, same as a linked budget's replenishment does.
  //
  // A rule only takes effect once its income actually has a connected
  // account - otherwise there is nothing to move money out of, so it's
  // silently dormant rather than an error (matches how settleOccurrence
  // itself only applies a settlement to `fields.balanceId` when one is set).
  for (const autoMove of input.incomeAutoMoves ?? []) {
    const sourceBalanceId = balanceIdByRecurringItemId.get(autoMove.incomeId);
    if (!sourceBalanceId) continue;
    const destination = balanceById.get(autoMove.destinationBalanceId);
    if (!destination) continue;
    const source = balanceById.get(sourceBalanceId);

    for (const { originalDate, effectiveDate } of incomeEffectiveOccurrences.get(autoMove.incomeId) ?? []) {
      // T224: per-instance edit for this exact occurrence, applied the same
      // way budget_replenish's own override is above - `skipped` drops the
      // occurrence entirely (no rows at all, same as an income occurrence's
      // own `skipped` override), `newAmount`/`newDate` replace the rule's
      // plain amount/the income's effective date only for this one date.
      const override = autoMoveOverridesByKey.get(autoMoveOverrideKey(autoMove.id, originalDate));
      if (override?.skipped) continue;

      const effectiveAmount = override?.newAmount ?? autoMove.amount;
      const effectiveDueDate = override?.newDate ?? effectiveDate;
      const isEdited = override && (override.newAmount != null || override.newDate != null) ? true : undefined;

      // User follow-up (2026-08-01): "the auto move doesn't have to appear
      // as a forecast transaction" - these two rows still exist and still
      // count toward runningBalance/per-account attribution (so Total
      // Balance and the destination account's own projected balance stay
      // correct), but `hidden` keeps them out of every visible list/
      // calendar view. The income's own row carries the indicator instead.
      rows.push({
        sourceType: "income_auto_move",
        sourceId: autoMove.id,
        originalDate,
        name: `Auto-move to ${destination.name}`,
        amount: -effectiveAmount,
        dueDate: effectiveDueDate,
        type: "auto_move",
        balanceId: sourceBalanceId,
        linkedIncomeId: autoMove.incomeId,
        hidden: true,
        edited: isEdited,
        // T172: the source account's own fee, same as any other transaction
        // touching it - a genuinely separate transfer, not a same-money
        // split like a budget replenishment (which deliberately carries no
        // fee here - see the budget_replenish row above).
        feeAmount: feeByBalanceId.get(sourceBalanceId),
      });
      rows.push({
        sourceType: "income_auto_move",
        sourceId: autoMove.id,
        originalDate,
        name: `Auto-move from ${source?.name ?? "account"}`,
        amount: effectiveAmount,
        dueDate: effectiveDueDate,
        type: "auto_move",
        balanceId: autoMove.destinationBalanceId,
        linkedIncomeId: autoMove.incomeId,
        hidden: true,
        edited: isEdited,
      });
    }
  }

  // Array.prototype.sort is stable (ES2019+), so equal due-date-and-sign rows keep
  // their insertion order. Same-day rows put incoming amounts (income, refunds) before
  // outgoing ones so the running balance reflects money landing before it's spent.
  rows.sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    const aIncoming = a.amount >= 0;
    const bIncoming = b.amount >= 0;
    if (aIncoming !== bIncoming) return aIncoming ? -1 : 1;
    return 0;
  });

  let runningBalance = balances.reduce((sum, balance) => sum + balance.amount, 0);

  return rows.map((row) => {
    // Bug fix (2026-08-02, reported against real production data): an
    // income_auto_move row is one leg of an internal transfer between two
    // *tracked* accounts - the combined total across every account can never
    // change because of it, no matter what order the two legs land in. The
    // sort above only guarantees "incoming before outgoing" for a shared due
    // date, which does NOT keep a transfer's debit and credit adjacent to
    // each other when another ordinary same-day row (e.g. a bill) was pushed
    // into `rows` earlier than the auto-move loop - that other row's
    // dueDate-and-sign tie is broken by array order (stable sort), landing
    // it between the credit and the debit. The credit had already applied
    // by then but the debit hadn't, so the combined total (and any visible
    // row's Balance column computed from it) sat inflated by the full
    // transfer amount until the debit finally caught up further down.
    // Concretely reported: Aug 5 income (₱78,000) auto-moves ₱50,000 to
    // another account; the very next visible row (a same-day bill) showed a
    // balance that had added the ₱50,000 before subtracting its own amount.
    // Per-account attribution (accountBalances.ts) is unaffected by this -
    // it walks `rows` independently and reads each row's own `amount`/
    // `balanceId` directly, never `runningBalance` - so excluding these two
    // legs from the *combined* total here doesn't touch what each account's
    // own projected balance shows.
    const contribution = row.sourceType === "income_auto_move" ? 0 : row.amount;
    // T172: the fee is always a cost, subtracted regardless of the
    // transaction's own direction - a fee credited back would be a
    // different feature (already representable as its own bill/income/misc
    // entry), not this one. Still applied here even for an auto-move's debit
    // leg - the fee is a real cost leaving the tracked accounts entirely,
    // not part of the internal transfer being netted out above.
    runningBalance = Math.round(runningBalance + contribution - (row.feeAmount ?? 0));
    // T150 (Bug #11): past-due rows run through the same cumulative balance
    // as everything else, deliberately. The account balances the user
    // maintains are what they hold *now*, and an unsettled past obligation
    // hasn't left the account yet - so it has to come off the top before the
    // future is projected, exactly as if it were due today.
    // T173: `dueToday` is a sibling flag, not a variant of past-due - a row
    // is one, the other, or neither, never both. Kept as its own field rather
    // than a shared "status" enum so existing `pastDue` checks and the many
    // `toEqual` test literals that omit both stay valid.
    if (row.dueDate < today) return { ...row, runningBalance, pastDue: true as const };
    if (row.dueDate === today) return { ...row, runningBalance, dueToday: true as const };
    return { ...row, runningBalance };
  });
}

export interface PastDueSplit {
  /** Unsettled rows whose date has already passed, oldest first. */
  pastDue: ForecastRow[];
  /** Everything dated today or later. */
  upcoming: ForecastRow[];
  /** Signed sum of the past-due rows - negative when money is owed on balance. */
  pastDueTotal: number;
  /**
   * The running balance once every past-due row is accounted for: the real
   * starting point for anything forward-looking. Equals the plain account
   * total when nothing is past due.
   */
  balanceAfterPastDue: number;
}

/**
 * Separates the past-due backlog from the forward forecast (T150).
 *
 * Forward-looking stats - lowest balance ahead, first danger point, Peaks and
 * Drops - must not treat a past-due dip as a *future* event, but they do have
 * to start from a balance that already accounts for the backlog. Passing
 * `upcoming` plus `balanceAfterPastDue` to those functions gives both, with no
 * change needed inside any of them.
 */
export function splitPastDue(rows: ForecastRow[], startingBalance: number): PastDueSplit {
  const pastDue = rows.filter((row) => row.pastDue);
  const upcoming = rows.filter((row) => !row.pastDue);

  return {
    pastDue,
    upcoming,
    pastDueTotal: pastDue.reduce((sum, row) => sum + row.amount, 0),
    // Rows are chronological, so the last past-due row already carries the
    // cumulative effect of every one before it.
    balanceAfterPastDue: pastDue.length > 0 ? pastDue[pastDue.length - 1].runningBalance : startingBalance,
  };
}
