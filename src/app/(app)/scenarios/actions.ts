"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import { readRecurrenceRuleForm } from "@/lib/recurrenceForm";
import { logActivity, type ActivityEntityType } from "@/lib/activityLog";
import type { RecurrenceEndsType, RecurrenceUnit } from "@/lib/engine/types";

export type ScenarioActionState = { error: string | null };

// T174: every page/action that reads recurring_items/one_off_items directly
// is untouched by this feature (see migration 0033's own comment) - the only
// place scenario data affects anything real-data-facing is loadForecast()'s
// merge and this "activate permanently" copy. Revalidating broadly here is
// cheap insurance against missing one.
const AFFECTED_PATHS = ["/", "/forecast", "/scenarios"];

export async function createScenario(
  _prevState: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const name = (formData.get("name") as string).trim();
  if (!name) return { error: "Name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("scenarios").insert({ user_id: user.id, name });
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, { action: "create", entityType: "misc", entityName: `Scenario: ${name}` });

  revalidatePath("/scenarios");
  return { error: null };
}

export async function renameScenario(
  _prevState: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string).trim();
  if (!name) return { error: "Name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("scenarios").update({ name }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/scenarios");
  return { error: null };
}

export async function deleteScenario(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Cascade deletes scenario_recurring_items/scenario_one_off_items/
  // scenario_budgets/scenario_budget_entries automatically (migrations
  // 0033/0037). Deleting an active scenario needs no separate "turn it off"
  // step either (T183) - `is_active` lives on the scenario row itself, so
  // the row and its active state disappear together.
  const { data: deleted } = await supabase.from("scenarios").delete().eq("id", id).select("name").single();
  if (user && deleted) {
    await logActivity(supabase, user.id, {
      action: "delete",
      entityType: "misc",
      entityName: `Scenario: ${deleted.name}`,
    });
  }

  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

// T183: each scenario's own independent on/off switch - reverses T174's
// "only one at a time" constraint (a plain `preferences.active_scenario_id`
// FK, which structurally couldn't express more than one) now that the user
// asked for unlimited simultaneously active scenarios. Migration 0038
// replaced that FK with a boolean directly on `scenarios` itself, so
// toggling one scenario never touches any other's state - no more
// "turning one on implicitly turns another off."
export async function toggleScenarioActive(formData: FormData) {
  const scenarioId = formData.get("scenarioId") as string;
  const active = formData.get("active") === "true";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("scenarios").update({ is_active: active }).eq("id", scenarioId);

  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

// T174: makes a scenario's synthetic entries real, permanent rows - the
// user's own "activate" framing. Irreversible, so it requires the same
// typed-confirmation pattern this app already uses for other irreversible
// actions (Settings' "Restore sample data" -> type RESTORE).
//
// Copies rows into recurring_items/one_off_items (real tables, no
// scenario_id column at all) rather than moving/re-parenting anything, then
// deletes the scenario - cascade takes its own scenario_* rows with it, so
// nothing is left half-migrated.
export async function activateScenarioPermanently(
  _prevState: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const id = formData.get("id") as string;
  const confirmation = formData.get("confirmation") as string;
  if (confirmation !== "ACTIVATE") return { error: 'Type "ACTIVATE" to confirm.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const [scenarioRes, recurringRes, oneOffRes, scenarioBudgetsRes, scenarioBudgetEntriesRes] = await Promise.all([
    supabase.from("scenarios").select("name").eq("id", id).single(),
    supabase
      .from("scenario_recurring_items")
      .select(
        "id, name, type, amount, comments, balance_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count",
      )
      .eq("scenario_id", id),
    supabase.from("scenario_one_off_items").select("name, amount, due_date, comments, balance_id").eq("scenario_id", id),
    // T182, full parity added by T218 follow-up (2026-08-02); real-data
    // linking added by T223 (2026-08-02, same day).
    supabase
      .from("scenario_budgets")
      .select(
        "id, name, allocation, linked_income_id, linked_scenario_income_id, balance_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count",
      )
      .eq("scenario_id", id),
    supabase
      .from("scenario_budget_entries")
      .select("scenario_budget_id, entry_date, amount, note, direction")
      .eq("scenario_id", id),
  ]);
  if (recurringRes.error) return { error: recurringRes.error.message };
  if (oneOffRes.error) return { error: oneOffRes.error.message };
  if (scenarioBudgetsRes.error) return { error: scenarioBudgetsRes.error.message };
  if (scenarioBudgetEntriesRes.error) return { error: scenarioBudgetEntriesRes.error.message };

  const oneOffsToInsert = (oneOffRes.data ?? []).map((row) => ({ ...row, user_id: user.id }));

  // T218 follow-up: recurring items need their new real id captured too now,
  // not just budgets below - a scenario budget linked to a scenario income
  // has to resolve that income's *real*, post-activation id, so one insert
  // per item rather than a bulk insert (same reasoning the budget loop
  // already used for its own id remap).
  const recurringIdMap = new Map<string, string>();
  for (const row of recurringRes.data ?? []) {
    const { id: scenarioItemId, ...fields } = row;
    const { data: inserted, error } = await supabase
      .from("recurring_items")
      .insert({ ...fields, user_id: user.id })
      .select("id")
      .single();
    if (error) return { error: error.message };
    recurringIdMap.set(scenarioItemId, inserted.id);
  }
  const recurringToInsert = recurringRes.data ?? [];

  if (oneOffsToInsert.length > 0) {
    const { error } = await supabase.from("one_off_items").insert(oneOffsToInsert);
    if (error) return { error: error.message };
  }

  // T182, full parity added by T218 follow-up: budgets need their new real
  // id captured before their entries can be inserted (entries reference
  // budget_id) - one insert per budget rather than a bulk insert, so each
  // old scenario_budgets id can be reliably paired with the new real
  // budgets id it maps to. Allocation/schedule now carry over too.
  //
  // T223: a *real* income link (`linked_income_id`) already points at a
  // real id, so it carries straight through unchanged - no remap needed,
  // unlike a scenario income link, which resolves through recurringIdMap
  // above (falls back to no link if that lookup somehow misses - a
  // scenario income should always have been activated in the same pass
  // just above, but a dangling budget with no matching income row is not
  // impossible, e.g. after manual data edits). `balance_id` doesn't go on
  // the `budgets` insert itself (T218 replaced that single column with the
  // `budget_budget_accounts` join table) - handled in its own loop just
  // below instead.
  const budgetIdMap = new Map<string, string>();
  for (const scenarioBudget of scenarioBudgetsRes.data ?? []) {
    const linkedIncomeId =
      scenarioBudget.linked_income_id ??
      (scenarioBudget.linked_scenario_income_id
        ? (recurringIdMap.get(scenarioBudget.linked_scenario_income_id) ?? null)
        : null);
    const { data: inserted, error } = await supabase
      .from("budgets")
      .insert({
        user_id: user.id,
        name: scenarioBudget.name,
        allocation: scenarioBudget.allocation,
        monthly_allocation: scenarioBudget.allocation,
        linked_income_id: linkedIncomeId,
        start_date: linkedIncomeId ? null : scenarioBudget.start_date,
        interval: linkedIncomeId ? null : scenarioBudget.interval,
        unit: linkedIncomeId ? null : scenarioBudget.unit,
        weekdays: linkedIncomeId ? null : scenarioBudget.weekdays,
        days_of_month: linkedIncomeId ? null : scenarioBudget.days_of_month,
        ordinal: linkedIncomeId ? null : scenarioBudget.ordinal,
        ordinal_weekday: linkedIncomeId ? null : scenarioBudget.ordinal_weekday,
        ends_type: linkedIncomeId ? null : scenarioBudget.ends_type,
        end_date: linkedIncomeId ? null : scenarioBudget.end_date,
        occurrence_count: linkedIncomeId ? null : scenarioBudget.occurrence_count,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    budgetIdMap.set(scenarioBudget.id, inserted.id);

    // T223/T284: this budget's real-account reference (if any) becomes a
    // real connection at exactly the moment the budget itself becomes real
    // - the same "replenish_amount defaults to the allocation" backfill
    // migration 0043 used for every pre-T218 single-account budget.
    if (scenarioBudget.balance_id) {
      const { error: linkError } = await supabase.from("budget_budget_accounts").insert({
        user_id: user.id,
        budget_id: inserted.id,
        balance_id: scenarioBudget.balance_id,
        replenish_amount: scenarioBudget.allocation,
      });
      if (linkError) return { error: linkError.message };
    }
  }

  const budgetEntriesToInsert = (scenarioBudgetEntriesRes.data ?? [])
    .map((row) => ({
      user_id: user.id,
      budget_id: budgetIdMap.get(row.scenario_budget_id),
      entry_date: row.entry_date,
      amount: row.amount,
      note: row.note,
      direction: row.direction,
    }))
    .filter((row): row is typeof row & { budget_id: string } => row.budget_id !== undefined);

  if (budgetEntriesToInsert.length > 0) {
    const { error } = await supabase.from("budget_entries").insert(budgetEntriesToInsert);
    if (error) return { error: error.message };
  }

  // Deleting the scenario cascades its own scenario_recurring_items/
  // scenario_one_off_items/scenario_budgets/scenario_budget_entries rows
  // away - its own `is_active` flag (T183) goes with it, no separate
  // cleanup needed.
  const { error: deleteError } = await supabase.from("scenarios").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  const itemCount =
    recurringToInsert.length + oneOffsToInsert.length + (scenarioBudgetsRes.data?.length ?? 0);
  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "misc",
    entityName: `Scenario: ${scenarioRes.data?.name ?? "Untitled"}`,
    detail: `Activated permanently - ${itemCount} item(s) made real`,
  });

  for (const path of [...AFFECTED_PATHS, "/bills", "/income", "/debt", "/savings", "/misc", "/budgets"]) {
    revalidatePath(path);
  }
  return { error: null };
}

// --- Scenario items (recurring-shaped: bill/income/debt/savings) ----------

function readScenarioItemForm(formData: FormData) {
  const name = (formData.get("name") as string).trim();
  const type = formData.get("type") as string;
  const amountPesos = parseCentavos(formData.get("amountPesos") as string);
  const startDate = formData.get("startDate") as string;
  const comments = ((formData.get("comments") as string) || "").trim() || null;
  const balanceId = (formData.get("balanceId") as string) || null;

  if (!name) return { error: "Name is required." } as const;
  if (!["bill", "income", "debt", "savings"].includes(type)) return { error: "Choose a type." } as const;
  // T192 (user request): 0 is a valid amount. Only an unparseable value is
  // rejected.
  if (amountPesos === null) return { error: "Enter a valid amount." } as const;
  if (!startDate) return { error: "Start date is required." } as const;

  // T174 items are hypothetical by definition, so unlike every real create
  // form (T107), a start date in the past is allowed - "what if I'd started
  // this savings goal 3 months ago" is a legitimate question to ask.
  const rule = readRecurrenceRuleForm(formData);
  if (rule.error !== null) return { error: rule.error } as const;

  return {
    ...rule,
    name,
    type: type as "bill" | "income" | "debt" | "savings",
    amount: type === "income" ? Math.abs(amountPesos) : -Math.abs(amountPesos),
    startDate,
    comments,
    balanceId,
  } as const;
}

export async function createScenarioItem(
  _prevState: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const scenarioId = formData.get("scenarioId") as string;
  const fields = readScenarioItemForm(formData);
  if (fields.error !== null) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("scenario_recurring_items").insert({
    user_id: user.id,
    scenario_id: scenarioId,
    name: fields.name,
    type: fields.type,
    amount: fields.amount,
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
    comments: fields.comments,
    balance_id: fields.balanceId,
  });
  if (error) return { error: error.message };

  // T226 (user request 2026-08-02, "every single action... should have a
  // corresponding update log"): scenario bills/income/debt/savings items
  // hadn't logged activity at all - the same "(scenario)" suffix pattern
  // T221 established for scenario budgets, so these read distinctly from
  // real records in the Updates feed.
  await logActivity(supabase, user.id, {
    action: "create",
    entityType: fields.type,
    entityName: `${fields.name} (scenario)`,
  });

  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
  return { error: null };
}

export async function updateScenarioItem(
  _prevState: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const id = formData.get("id") as string;
  const scenarioId = formData.get("scenarioId") as string;
  const fields = readScenarioItemForm(formData);
  if (fields.error !== null) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("scenario_recurring_items")
    .update({
      name: fields.name,
      type: fields.type,
      amount: fields.amount,
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
      comments: fields.comments,
      balance_id: fields.balanceId,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  if (user) {
    await logActivity(supabase, user.id, {
      action: "update",
      entityType: fields.type,
      entityName: `${fields.name} (scenario)`,
    });
  }

  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
  return { error: null };
}

export async function deleteScenarioItem(formData: FormData) {
  const id = formData.get("id") as string;
  const scenarioId = formData.get("scenarioId") as string;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: deleted } = await supabase
    .from("scenario_recurring_items")
    .delete()
    .eq("id", id)
    .select("name, type")
    .single();
  if (user && deleted) {
    await logActivity(supabase, user.id, {
      action: "delete",
      entityType: deleted.type as ActivityEntityType,
      entityName: `${deleted.name} (scenario)`,
    });
  }
  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

// --- Scenario one-offs (misc-shaped) ---------------------------------------

function readScenarioOneOffForm(formData: FormData) {
  const name = (formData.get("name") as string).trim();
  const magnitude = parseCentavos(formData.get("amountPesos") as string);
  const direction = formData.get("direction") as string;
  const dueDate = formData.get("dueDate") as string;
  const comments = ((formData.get("comments") as string) || "").trim() || null;
  const balanceId = (formData.get("balanceId") as string) || null;

  if (!name) return { error: "Name is required." } as const;
  // T192 (user request): 0 is a valid amount. Only an unparseable value is
  // rejected.
  if (magnitude === null) return { error: "Enter a valid amount." } as const;
  if (direction !== "in" && direction !== "out") return { error: "Choose money in or money out." } as const;
  if (!dueDate) return { error: "Due date is required." } as const;

  return {
    error: null,
    name,
    amount: direction === "in" ? Math.abs(magnitude) : -Math.abs(magnitude),
    dueDate,
    comments,
    balanceId,
  } as const;
}

export async function createScenarioOneOff(
  _prevState: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const scenarioId = formData.get("scenarioId") as string;
  const fields = readScenarioOneOffForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("scenario_one_off_items").insert({
    user_id: user.id,
    scenario_id: scenarioId,
    name: fields.name,
    amount: fields.amount,
    due_date: fields.dueDate,
    comments: fields.comments,
    balance_id: fields.balanceId,
  });
  if (error) return { error: error.message };

  await logActivity(supabase, user.id, {
    action: "create",
    entityType: "misc",
    entityName: `${fields.name} (scenario)`,
  });

  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
  return { error: null };
}

export async function updateScenarioOneOff(
  _prevState: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const id = formData.get("id") as string;
  const scenarioId = formData.get("scenarioId") as string;
  const fields = readScenarioOneOffForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("scenario_one_off_items")
    .update({
      name: fields.name,
      amount: fields.amount,
      due_date: fields.dueDate,
      comments: fields.comments,
      balance_id: fields.balanceId,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  if (user) {
    await logActivity(supabase, user.id, {
      action: "update",
      entityType: "misc",
      entityName: `${fields.name} (scenario)`,
    });
  }

  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
  return { error: null };
}

export async function deleteScenarioOneOff(formData: FormData) {
  const id = formData.get("id") as string;
  const scenarioId = formData.get("scenarioId") as string;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: deleted } = await supabase
    .from("scenario_one_off_items")
    .delete()
    .eq("id", id)
    .select("name")
    .single();
  if (user && deleted) {
    await logActivity(supabase, user.id, {
      action: "delete",
      entityType: "misc",
      entityName: `${deleted.name} (scenario)`,
    });
  }
  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

// --- Scenario budgets (T182, full parity added by T218 follow-up) ----------
//
// REMINDER, 2026-08-02: "Adding a budget in a Scenario should allow me to
// get all functionalities of adding a new budget in the real thing, not
// just add a budget name." Now the same shape as a real budget's own form
// (BudgetModal.tsx) - name, allocation, and a three-way replenish source
// (connected to one of the scenario's own incomes / its own schedule /
// manual) - with one deliberate exception: no budget-account link. A budget
// account is real storage for real money, and nothing about a scenario
// touches real money until "Activate permanently" copies it into real
// tables, at which point it becomes a real budget and can be linked like
// any other (see migration 0046's own comment).
//
// The engine treats a scenario budget exactly like a real one always has
// (Budgets v3, Phase 10) - `linked_income_id`/the schedule only ever drive
// BudgetCard-style display (progress bar, "days until replenish") and a
// real settle-time trigger; neither real nor scenario budgets get a
// projected reservation row in the Forecast. A scenario budget's actual
// forecast effect still comes only from its own future-dated entries
// (`scenario_budget_entries`, unchanged) - configuring a replenish source
// here does not fabricate money that was never logged, same as a real
// budget.

type ScenarioBudgetFormFields =
  | { error: string }
  | {
      error: null;
      name: string;
      allocation: number;
      linkedIncomeId: string | null;
      linkedScenarioIncomeId: string | null;
      balanceId: string | null;
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

const SCENARIO_BUDGET_EMPTY_SCHEDULE = {
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

// T223 (user request 2026-08-02): "all active income should be available
// as options in the scenario budget" - the income picker (ScenarioBudgetModal)
// offers both real incomes and this scenario's own hypothetical ones in one
// select, values prefixed to tell them apart (same encoding pattern
// MoveBudgetFundsModal.tsx uses for its own two-kind picker).
const REAL_INCOME_PREFIX = "real:";
const SCENARIO_INCOME_PREFIX = "scenario:";

function readScenarioBudgetForm(formData: FormData): ScenarioBudgetFormFields {
  const name = (formData.get("name") as string).trim();
  if (!name) return { error: "Name is required." };
  const allocation = parseCentavos(formData.get("allocationPesos") as string);
  if (allocation === null || allocation < 0) return { error: "Enter a valid allocation." };
  const source = formData.get("replenishSource") as string;
  // T223: optional regardless of replenish source - purely a reference to
  // where this budget's money would live, never mutated by scenario
  // activity (see migration 0047's own comment).
  const balanceId = (formData.get("balanceId") as string) || null;

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
      linkedScenarioIncomeId: null,
      balanceId,
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
    const incomeSelection = (formData.get("incomeSelection") as string) || "";
    if (!incomeSelection) return { error: "Choose an income source." };
    const linkedIncomeId = incomeSelection.startsWith(REAL_INCOME_PREFIX)
      ? incomeSelection.slice(REAL_INCOME_PREFIX.length)
      : null;
    const linkedScenarioIncomeId = incomeSelection.startsWith(SCENARIO_INCOME_PREFIX)
      ? incomeSelection.slice(SCENARIO_INCOME_PREFIX.length)
      : null;
    if (!linkedIncomeId && !linkedScenarioIncomeId) return { error: "Choose an income source." };
    return {
      error: null,
      name,
      allocation,
      linkedIncomeId,
      linkedScenarioIncomeId,
      balanceId,
      ...SCENARIO_BUDGET_EMPTY_SCHEDULE,
    };
  }

  return {
    error: null,
    name,
    allocation,
    linkedIncomeId: null,
    linkedScenarioIncomeId: null,
    balanceId,
    ...SCENARIO_BUDGET_EMPTY_SCHEDULE,
  };
}

export async function createScenarioBudget(
  _prevState: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const scenarioId = formData.get("scenarioId") as string;
  const fields = readScenarioBudgetForm(formData);
  if (fields.error !== null) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("scenario_budgets").insert({
    user_id: user.id,
    scenario_id: scenarioId,
    name: fields.name,
    allocation: fields.allocation,
    linked_income_id: fields.linkedIncomeId,
    linked_scenario_income_id: fields.linkedScenarioIncomeId,
    balance_id: fields.balanceId,
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

  // REMINDER, 2026-08-02 ("This also should show in the Updates"): a
  // scenario budget is now rich enough (allocation, replenish source) that
  // its own create/edit/delete is worth a line in the Updates feed, the
  // same way a real budget's already is - previously no scenario item type
  // logged activity at all, since a bare-name pot wasn't worth one.
  await logActivity(supabase, user.id, {
    action: "create",
    entityType: "budget",
    entityName: `${fields.name} (scenario)`,
  });

  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
  return { error: null };
}

export async function updateScenarioBudget(
  _prevState: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const id = formData.get("id") as string;
  const scenarioId = formData.get("scenarioId") as string;
  const fields = readScenarioBudgetForm(formData);
  if (fields.error !== null) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("scenario_budgets")
    .update({
      name: fields.name,
      allocation: fields.allocation,
      linked_income_id: fields.linkedIncomeId,
      linked_scenario_income_id: fields.linkedScenarioIncomeId,
      balance_id: fields.balanceId,
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
    await logActivity(supabase, user.id, {
      action: "update",
      entityType: "budget",
      entityName: `${fields.name} (scenario)`,
    });
  }

  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
  return { error: null };
}

export async function deleteScenarioBudget(formData: FormData) {
  const id = formData.get("id") as string;
  const scenarioId = formData.get("scenarioId") as string;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Cascades scenario_budget_entries away with it (migration 0037).
  const { data: deleted } = await supabase.from("scenario_budgets").delete().eq("id", id).select("name").single();
  if (user && deleted) {
    await logActivity(supabase, user.id, {
      action: "delete",
      entityType: "budget",
      entityName: `${deleted.name} (scenario)`,
    });
  }
  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

function readScenarioBudgetEntryForm(formData: FormData) {
  const magnitude = parseCentavos(formData.get("amountPesos") as string);
  const direction = formData.get("direction") as string;
  const entryDate = formData.get("entryDate") as string;
  const note = ((formData.get("note") as string) || "").trim() || null;

  // T192 (user request): 0 is a valid amount - only negative or unparseable
  // is rejected.
  if (magnitude === null || magnitude < 0) return { error: "Enter a valid amount." } as const;
  if (direction !== "incoming" && direction !== "outgoing") {
    return { error: "Choose money in or money out." } as const;
  }
  if (!entryDate) return { error: "Date is required." } as const;

  return { error: null, amount: magnitude, direction, entryDate, note } as const;
}

export async function createScenarioBudgetEntry(
  _prevState: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const scenarioId = formData.get("scenarioId") as string;
  const scenarioBudgetId = formData.get("scenarioBudgetId") as string;
  const fields = readScenarioBudgetEntryForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("scenario_budget_entries").insert({
    user_id: user.id,
    scenario_id: scenarioId,
    scenario_budget_id: scenarioBudgetId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    direction: fields.direction,
    note: fields.note,
  });
  if (error) return { error: error.message };

  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
  return { error: null };
}

export async function updateScenarioBudgetEntry(
  _prevState: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const id = formData.get("id") as string;
  const scenarioId = formData.get("scenarioId") as string;
  const fields = readScenarioBudgetEntryForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("scenario_budget_entries")
    .update({
      entry_date: fields.entryDate,
      amount: fields.amount,
      direction: fields.direction,
      note: fields.note,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
  return { error: null };
}

export async function deleteScenarioBudgetEntry(formData: FormData) {
  const id = formData.get("id") as string;
  const scenarioId = formData.get("scenarioId") as string;
  const supabase = await createClient();
  await supabase.from("scenario_budget_entries").delete().eq("id", id);
  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}
