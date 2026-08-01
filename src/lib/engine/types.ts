export type RecurringItemType = "bill" | "income" | "debt" | "savings";

// SPEC.md Phase 6A recurrence rule shape (migration 0004; the old 4-frequency
// model's columns were dropped by migration 0005 once T35 shipped).
export type RecurrenceUnit = "day" | "week" | "month" | "year";
export type RecurrenceEndsType = "never" | "on_date" | "after_count";

export interface Balance {
  id: string;
  name: string;
  amount: number; // centavos
  // T172: flat cost (centavos, >= 0) auto-deducted from every forecasted
  // transaction connected to this account, both incoming and outgoing.
  // Optional/undefined means no fee (0), matching the DB default - keeps
  // every existing fixture and test constructor valid.
  transactionFeeCentavos?: number;
}

export interface RecurringItem {
  id: string;
  name: string;
  type: RecurringItemType;
  amount: number; // centavos; signed (bills/debt/savings negative, income positive)
  startDate: string; // YYYY-MM-DD
  // T71 (SPEC.md Phase 12): optional link to a balances row. When set, the
  // Forecast settle modal defaults to this account and settling applies the
  // actual amount to it automatically - see ForecastRow.balanceId below.
  balanceId: string | null;
  // T175: false hides this item from the forecast entirely, without deleting
  // it. Optional so every existing fixture and test constructor stays valid;
  // undefined means active, matching the DB default.
  active?: boolean;
  // T174: true when this item was merged in from an active "what-if"
  // scenario rather than being a real row - lets the UI badge it distinctly
  // so hypothetical numbers are never mistaken for real ones. Never set by
  // the DB row itself (recurring_items has no such column); forecastData.ts
  // stamps it onto scenario-sourced items when it builds this array.
  fromScenario?: true;
  // T155: the user's own note on the item, carried through to the Forecast
  // row so it can be surfaced there. Optional rather than required-nullable
  // like balanceId above, deliberately: the engine never reads it, it is
  // display metadata passing through, and optional keeps every existing
  // fixture and constructor valid.
  comments?: string | null;

  // Recurrence rule (SPEC.md Phase 6A). interval/unit/endsType are DB
  // NOT NULL - every row has a complete rule. The rest depend on which
  // rule shape is in use (e.g. a week-unit item has null daysOfMonth).
  interval: number; // repeat every N units
  unit: RecurrenceUnit;
  weekdays: number[] | null; // 0-6 (Sun-Sat); for unit "week"
  daysOfMonth: number[] | null; // 1-31; for unit "month"
  ordinal: number | null; // nth-weekday: 1-4 or -1=last; for unit "month"
  ordinalWeekday: number | null; // paired with ordinal
  endsType: RecurrenceEndsType;
  endDate: string | null; // YYYY-MM-DD; set iff endsType is "on_date"
  occurrenceCount: number | null; // set iff endsType is "after_count"
}

// The minimal shape expandRecurrenceOccurrences (recurrence.ts) needs -
// RecurringItem's new-rule fields, narrowed to non-null by the caller once
// it's confirmed an item has actually migrated (see forecast.ts).
export interface RecurrenceRule {
  startDate: string;
  interval: number;
  unit: RecurrenceUnit;
  weekdays: number[] | null;
  daysOfMonth: number[] | null;
  ordinal: number | null; // 1-4 (1st..4th) or -1 (last); unit "month" only
  ordinalWeekday: number | null; // 0-6 (Sun-Sat); paired with ordinal
  endsType: RecurrenceEndsType;
  endDate: string | null;
  occurrenceCount: number | null;
}

export interface OccurrenceOverride {
  id: string;
  recurringItemId: string;
  originalDate: string; // YYYY-MM-DD, identifies which occurrence is overridden
  newDate: string | null;
  newAmount: number | null; // centavos
  newName: string | null;
  skipped: boolean;
}

export interface OneOffItem {
  id: string;
  name: string;
  amount: number; // centavos, signed
  dueDate: string; // YYYY-MM-DD
  // T71 (SPEC.md Phase 12): see RecurringItem.balanceId above.
  balanceId: string | null;
  // T155: see RecurringItem.comments above.
  comments?: string | null;
  // T175: see RecurringItem.active above.
  active?: boolean;
  // T174: see RecurringItem.fromScenario above.
  fromScenario?: true;
}

// Budgets v3 - a running ledger (SPEC.md Phase 10, T57 cutover). The old
// cycle/allocation/carryover model (Phase 6B) is gone. Phase 11 (T58)
// re-adds a schedule, but only to drive *when* a budget replenishes, not a
// cycle/boundary/carryover concept - the ledger balance math
// (computeBudgetBalance) is unaffected.
export interface Budget {
  id: string;
  name: string;
  allocation: number; // centavos, >= 0 - how much gets added when this budget replenishes
  linkedIncomeId: string | null;
  createdAt: string; // YYYY-MM-DD
  // T175: see RecurringItem.active. Excludes this budget's projected
  // replenishments and future ledger entries from the forecast; the budget's
  // own running total on the Budgets page is unaffected, since that is a
  // record of money already moved rather than a projection.
  active?: boolean;
  // T182: true when this budget was merged in from an active "what-if"
  // scenario rather than being a real row - see RecurringItem.fromScenario.
  fromScenario?: true;

  // Phase 11 (T58): a budget's own replenish schedule ("replenish every"),
  // set only when linkedIncomeId is null (DB-enforced mutual exclusivity -
  // migration 0011). Same rule shape as RecurringItem/RecurrenceRule; every
  // field is null together when the budget has no own schedule (it's
  // either income-linked or manual).
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
}

// Phase 11 (SPEC.md T59): marks a budget's projected replenish occurrence
// (see ForecastRow's "budget_replenish" sourceType below) as handled -
// settled or skipped - so it stops re-projecting, mirroring
// OccurrenceOverride for recurring items but without move/edit fields (v1
// scope: settle or leave projected).
export interface BudgetReplenishOverride {
  id: string;
  budgetId: string;
  originalDate: string; // YYYY-MM-DD, identifies which projected occurrence this covers
  skipped: boolean;
  // T168 (migration 0027): per-instance edits, mirroring OccurrenceOverride's
  // long-standing shape. Null means "leave this alone" for each field
  // independently, so an occurrence can be moved without changing its amount
  // and vice versa. `newAmount` is a positive magnitude like
  // `Budget.allocation`, which the forecast negates for display.
  newDate?: string | null;
  newAmount?: number | null;
}

// SPEC.md T212 (user request 2026-08-01): "when an income arrives to a
// certain account connected to it, it needs to auto move a portion of the
// income amount received to another main account." The rule lives on the
// income (not the destination) - one income can define several of these, so
// a paycheck can split across accounts. Only ever takes effect when the
// income itself has a connected account (RecurringItem.balanceId) - that's
// where the money actually comes from.
export interface IncomeAutoMove {
  id: string;
  incomeId: string;
  destinationBalanceId: string;
  amount: number; // centavos, positive magnitude
}

export interface BudgetEntry {
  id: string;
  budgetId: string;
  entryDate: string; // YYYY-MM-DD
  amount: number; // centavos, always a positive magnitude - direction gives the sign
  note: string | null;
  // Budgets v3 (SPEC.md Phase 10, migration 0009): "incoming" (replenishment
  // - a settled linked income or a manual add) or "outgoing" (a logged
  // spend or a manual take) against the budget's running total, consumed by
  // budgetLedger.ts. DB NOT NULL as of migration 0009; kept optional here
  // only so a handful of pre-Phase-10 test literals that never set it don't
  // need touching.
  direction?: "incoming" | "outgoing";
  // T222 (user request 2026-08-02): which one of the budget's connected
  // budget accounts (T218) this specific entry actually touched - null for
  // an entry that predates T218/T044's `budget_account_id` column, or a
  // budget with no connected account at all. Lets a budget's own ledger
  // total (`computeBudgetBalance`, ignores this field) be broken down
  // further into "how much of this budget's money sits in this particular
  // account" (`computeBudgetAccountBalance`, below).
  budgetAccountId?: string | null;
}

export interface ForecastRow {
  // "budget" (a projected cycle-boundary/reservation row) existed under the
  // old model and was gone as of T57 in favor of just "budget_entry" (a
  // real future-dated ledger entry). Phase 11 (T59) adds "budget_replenish"
  // back - a projected future replenish occurrence (own schedule or linked
  // income's), a real deduction from cash flow once settled, not a soft
  // reservation like the old "budget" rows were.
  // T212: "income_auto_move" - a projected settle-time transfer leg (see
  // IncomeAutoMove above), always generated in pairs (one outgoing on the
  // income's own account, one incoming on the destination), the same way a
  // manual Move funds (T186) shows up as two ledger legs.
  sourceType: "recurring" | "one_off" | "budget_entry" | "budget_replenish" | "income_auto_move";
  sourceId: string;
  originalDate: string;
  name: string;
  amount: number; // centavos
  dueDate: string;
  type: RecurringItemType | "extra" | "budget" | "auto_move";
  runningBalance: number; // centavos
  // budget_entry and budget_replenish rows: the parent budget's id/name and
  // the entry's own note (budget_entry only), separate from `name` (which
  // combines them for display) so EditSettleModal can prefill its forms
  // without re-parsing the combined string.
  budgetId?: string;
  budgetName?: string;
  note?: string | null;
  // budget_replenish rows only (SPEC.md T59): true when this row can be
  // settled directly from the Forecast - only for a budget on its own
  // schedule. An income-linked budget's row instead settles automatically
  // when its linked income is settled (extending T56's existing hook), so
  // it's never independently clickable - omitted (not false) for every
  // other row, same convention as `edited`.
  budgetSettleable?: true;
  // True when a non-skipped occurrence_overrides row applied to this
  // occurrence (SPEC.md Phase 7 "edited-occurrence indicator") - omitted
  // rather than false so existing forecast.test.ts literals using toEqual
  // don't need updating (toEqual treats a missing key the same as an
  // explicit `undefined`).
  edited?: true;
  // T71 (SPEC.md Phase 12): the source item's linked account, for
  // "recurring"/"one_off" rows - lets the Forecast settle modal pre-select
  // it. Omitted (not null) when unset, same convention as `edited`, so
  // existing toEqual literals without it are unaffected.
  //
  // T191: also set on a "budget_replenish" row when its budget is linked to
  // an income that itself has a connected account - that account is where
  // the replenishment's money actually comes from (settleOccurrence nets the
  // allocation out of it in one write alongside the income, T151/Bug #14),
  // so it's a real connection, not a guess. An own-schedule budget (no
  // linked income) has nothing to attribute here and stays unset, same as
  // before this existed. Never set on "budget_entry" rows - a ledger entry
  // (spend/manual add/take) only ever moves money within the budget's own
  // ledger, never a main account.
  balanceId?: string;
  // T172: the connected account's flat transaction fee, already folded into
  // `runningBalance` but kept as its own field so the UI can show it as a
  // visible line rather than silently altering `amount` (which should always
  // match the underlying bill/income/misc record's real value). Omitted
  // (not 0) when the row has no connected account or that account has no
  // fee, same convention as every other optional flag here.
  //
  // T191: deliberately omitted on an income-linked "budget_replenish" row
  // even when `balanceId` above resolves an account with its own fee - the
  // income row landing alongside it already carries that fee, and
  // `settleOccurrence` only ever deducts it once. Charging it twice here
  // would be the same class of forecast-versus-reality drift Bug #14 was
  // about, just reintroduced in projection.
  feeAmount?: number;
  // T174: true when this row comes from an active "what-if" scenario rather
  // than real data - only ever set for "recurring"/"one_off" rows, since
  // scenarios don't cover budgets in v1. Omitted (not false) for real rows,
  // same convention as every other flag here, so the UI can badge a
  // scenario row unmistakably.
  fromScenario?: true;
  // T155: the source item's own comment, for the Forecast's comment-bubble
  // indicator. Only ever set for "recurring"/"one_off" rows (budget rows use
  // `note` above), and omitted rather than null when the item has none, so a
  // row without a comment renders nothing at all.
  comment?: string;
  // T150 (Bug #11): the occurrence's date has passed and it was never
  // settled, so it's still owed. The engine used to drop these rows
  // entirely, which silently erased real obligations from the running
  // balance. Omitted (not false) for ordinary rows, same convention as
  // `edited` and `balanceId` above.
  pastDue?: true;
  // T173: the occurrence falls on today. Mutually exclusive with `pastDue`
  // above - a row is one, the other, or neither. Omitted (not false) for
  // ordinary future rows, same convention as every other flag here.
  dueToday?: true;
  // T212: "income_auto_move" rows only - the income the rule is attached
  // to. Carried through even though these rows are `hidden` (below) in case
  // a future caller needs to trace a row back to its income.
  linkedIncomeId?: string;
  // T212 (user follow-up 2026-08-01): "the auto move doesn't have to appear
  // as a forecast transaction" - a hidden row still exists and still counts
  // toward runningBalance/per-account attribution (accountBalances.ts), so
  // Total Balance and the destination account's own projected balance stay
  // correct, but the UI never renders it as a visible list item. The
  // income's own row carries a tag/indicator instead (ForecastClient.tsx,
  // CalendarGrid.tsx, EditSettleModal.tsx each resolve this independently
  // from `GenerateForecastInput.incomeAutoMoves`, keyed by the income's own
  // id - not a flag on the row itself, since any "recurring"+"income" row
  // needs it, not just this one).
  hidden?: true;
}

export interface GenerateForecastInput {
  balances: Balance[];
  recurringItems: RecurringItem[];
  overrides: OccurrenceOverride[];
  oneOffs: OneOffItem[];
  budgets?: Budget[];
  budgetEntries?: BudgetEntry[];
  budgetReplenishOverrides?: BudgetReplenishOverride[];
  incomeAutoMoves?: IncomeAutoMove[];
  today: string; // YYYY-MM-DD
  horizon: string; // YYYY-MM-DD
}
