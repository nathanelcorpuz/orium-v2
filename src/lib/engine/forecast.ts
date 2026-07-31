import type {
  BudgetReplenishOverride,
  ForecastRow,
  GenerateForecastInput,
  OccurrenceOverride,
  RecurrenceRule,
  RecurringItem,
} from "./types";
import { expandRecurrenceOccurrences } from "./recurrence";
import { budgetReplenishRule, futureBudgetLedgerEntries, futureBudgetReplenishDates } from "./budgetLedger";

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

      rows.push({
        sourceType: "recurring",
        sourceId: item.id,
        originalDate: date,
        name: override?.newName ?? item.name,
        amount: override?.newAmount ?? item.amount,
        dueDate: effectiveDate,
        type: item.type,
        edited: override ? true : undefined,
        balanceId: item.balanceId ?? undefined,
        // T155: pass-through only - the engine never reads it. Empty strings
        // collapse to undefined so a blank comment doesn't render an
        // indicator with nothing behind it.
        comment: item.comments?.trim() ? item.comments : undefined,
        // T172: looked up from the connected account, if any.
        feeAmount: item.balanceId ? feeByBalanceId.get(item.balanceId) : undefined,
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
      });
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
    // T172: the fee is always a cost, subtracted regardless of the
    // transaction's own direction - a fee credited back would be a
    // different feature (already representable as its own bill/income/misc
    // entry), not this one.
    runningBalance = Math.round(runningBalance + row.amount - (row.feeAmount ?? 0));
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
