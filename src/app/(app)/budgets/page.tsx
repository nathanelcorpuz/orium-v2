import { createClient } from "@/lib/supabase/server";
import { idSetFromColumn } from "@/lib/editedItems";
import { BudgetsClient } from "./BudgetsClient";
import type { BudgetEntryRow, IncomeItemRow } from "./BudgetCard";
import type { AccountOption, BudgetRow } from "./BudgetModal";

export default async function BudgetsPage() {
  const supabase = await createClient();

  const [
    budgetsRes,
    entriesRes,
    incomesRes,
    replenishOverridesRes,
    incomeOverridesRes,
    balancesRes,
    budgetAccountLinksRes,
  ] = await Promise.all([
    supabase
      .from("budgets")
      .select(
        "id, name, monthly_allocation, allocation, created_at, linked_income_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, active, assumed_spend_percent",
      )
      .order("name", { ascending: true }),
      // Every entry, not just the current month - a budget's running total
      // (SPEC.md Phase 10, budgetLedger.ts) needs its full history; the month
      // filter in BudgetCard narrows what's *displayed* client-side.
      supabase
        .from("budget_entries")
        .select("id, budget_id, entry_date, amount, note, direction, balance_id")
        .order("entry_date", { ascending: true }),
      // Phase 11 (T60): the recurrence rule columns too, not just id/name - an
      // income-linked budget's "days until replenish" progress bar
      // (BudgetCard.tsx) resolves its schedule from whichever income it's
      // linked to, via budgetReplenishRule (engine/budgetLedger.ts).
      supabase
        .from("recurring_items")
        .select(
          "id, name, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, balance_id",
        )
        .eq("type", "income")
        .order("name", { ascending: true }),
      // T51: any budget_replenish_overrides row (including a pure skip) marks
      // the budget itself as edited - the table SPEC.md calls
      // "budget_occurrence_overrides" was dropped in migration 0010 and
      // replaced by this one in migration 0011 (T59).
      // T167 adds original_date/skipped: BudgetCard's "days until replenish"
      // needs to know which occurrences have already been settled, or it keeps
      // saying "Replenishes today" after the money has already moved.
      supabase.from("budget_replenish_overrides").select("budget_id, original_date, skipped"),
      // Bug (user report, 2026-08-01): a budget linked to an income *after*
      // that income's occurrence for today was already settled has no
      // `budget_replenish_overrides` row of its own yet (settleOccurrence only
      // ever writes one for budgets that were linked *at settle time*), so the
      // check above alone still finds nothing "handled" and reports "Replenishes
      // today" - technically true of the rule, but the money for today already
      // moved without this budget. The income's own settled occurrence
      // (`occurrence_overrides.skipped`) closes that gap: if the income itself
      // is done for that date, no budget can still be waiting on it.
      supabase.from("occurrence_overrides").select("recurring_item_id, original_date").eq("skipped", true),
      // T284: the regular accounts list - doubles as both the source for a
      // linked income's own connected main account (User request
      // 2026-08-01) and the connected-account picker each budget's
      // create/edit form offers. There's no separate "budget accounts"
      // table anymore (T204's own, dropped by migration 0054).
      supabase.from("balances").select("id, name"),
      // T218/T284: every budget's connected account(s) - replaces T204's
      // single `budgets.budget_account_id` column, for both the manual
      // Log spend/Add/Take funds picker and the per-account breakdown line.
      supabase.from("budget_budget_accounts").select("budget_id, balance_id, replenish_amount"),
    ]);

  if (budgetsRes.error) {
    return <p className="p-8 text-red-600">Could not load budgets: {budgetsRes.error.message}</p>;
  }
  if (entriesRes.error) {
    return (
      <p className="p-8 text-red-600">Could not load budget entries: {entriesRes.error.message}</p>
    );
  }
  if (incomesRes.error) {
    return <p className="p-8 text-red-600">Could not load income sources: {incomesRes.error.message}</p>;
  }
  if (replenishOverridesRes.error) {
    return (
      <p className="p-8 text-red-600">
        Could not load budget overrides: {replenishOverridesRes.error.message}
      </p>
    );
  }
  if (incomeOverridesRes.error) {
    return (
      <p className="p-8 text-red-600">
        Could not load income schedules: {incomeOverridesRes.error.message}
      </p>
    );
  }
  if (balancesRes.error) {
    return <p className="p-8 text-red-600">Could not load accounts: {balancesRes.error.message}</p>;
  }
  if (budgetAccountLinksRes.error) {
    return (
      <p className="p-8 text-red-600">
        Could not load connected budget accounts: {budgetAccountLinksRes.error.message}
      </p>
    );
  }

  const budgets: BudgetRow[] = budgetsRes.data ?? [];
  const balances: AccountOption[] = balancesRes.data ?? [];

  // T218/T284: every connected account per budget, in insert order -
  // BudgetCard resolves each link's live name against `balances` above;
  // BudgetModal uses the same list to prefill its edit form.
  const accountLinksByBudgetId: Record<string, { balanceId: string; replenishAmount: number }[]> = {};
  for (const link of budgetAccountLinksRes.data ?? []) {
    const list = accountLinksByBudgetId[link.budget_id] ?? [];
    list.push({ balanceId: link.balance_id, replenishAmount: link.replenish_amount });
    accountLinksByBudgetId[link.budget_id] = list;
  }

  const entriesByBudgetId: Record<string, BudgetEntryRow[]> = {};
  for (const entry of entriesRes.data ?? []) {
    const list = entriesByBudgetId[entry.budget_id] ?? [];
    list.push({
      id: entry.id,
      entry_date: entry.entry_date,
      amount: entry.amount,
      note: entry.note,
      direction: entry.direction,
      balance_id: entry.balance_id,
    });
    entriesByBudgetId[entry.budget_id] = list;
  }

  const incomes: IncomeItemRow[] = (incomesRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    interval: row.interval,
    unit: row.unit,
    weekdays: row.weekdays,
    daysOfMonth: row.days_of_month,
    ordinal: row.ordinal,
    ordinalWeekday: row.ordinal_weekday,
    endsType: row.ends_type,
    endDate: row.end_date,
    occurrenceCount: row.occurrence_count,
    balanceId: row.balance_id,
  }));

  const editedIds = idSetFromColumn(replenishOverridesRes.data, "budget_id");

  // T167: only *skipped* rows count as handled. A T168 edit override is also
  // a row in this table but the occurrence it describes is still coming, so
  // treating it as handled would skip a replenishment that hasn't happened.
  const handledDatesByBudgetId: Record<string, string[]> = {};
  for (const override of replenishOverridesRes.data ?? []) {
    if (!override.skipped) continue;
    const list = handledDatesByBudgetId[override.budget_id] ?? [];
    list.push(override.original_date);
    handledDatesByBudgetId[override.budget_id] = list;
  }

  // Bug fix (user report, 2026-08-01): a budget linked to an income *after*
  // that income's occurrence for a given date was already settled has no
  // `budget_replenish_overrides` row of its own for that date (settling only
  // ever writes one for budgets linked at the time), so it still read as
  // "not yet handled" and reported "Replenishes today" for a day the linked
  // income had already moved past. Every skipped date on the income's *own*
  // schedule closes that gap for every budget linked to it, on top of the
  // budget's own handled dates above.
  const skippedDatesByIncomeId: Record<string, string[]> = {};
  for (const override of incomeOverridesRes.data ?? []) {
    const list = skippedDatesByIncomeId[override.recurring_item_id] ?? [];
    list.push(override.original_date);
    skippedDatesByIncomeId[override.recurring_item_id] = list;
  }
  for (const budget of budgets) {
    if (!budget.linked_income_id) continue;
    const incomeSkippedDates = skippedDatesByIncomeId[budget.linked_income_id];
    if (!incomeSkippedDates) continue;
    const list = handledDatesByBudgetId[budget.id] ?? [];
    handledDatesByBudgetId[budget.id] = [...list, ...incomeSkippedDates];
  }

  return (
    <BudgetsClient
      budgets={budgets}
      entriesByBudgetId={entriesByBudgetId}
      incomes={incomes}
      balances={balances}
      editedIds={editedIds}
      handledDatesByBudgetId={handledDatesByBudgetId}
      accountLinksByBudgetId={accountLinksByBudgetId}
    />
  );
}
