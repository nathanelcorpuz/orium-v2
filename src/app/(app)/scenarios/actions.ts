"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import { readRecurrenceRuleForm } from "@/lib/recurrenceForm";
import { logActivity } from "@/lib/activityLog";

export type ScenarioActionState = { error: string | null };

// T174: every page/action that reads recurring_items/one_off_items directly
// is untouched by this feature (see migration 0033's own comment) - the only
// place scenario data affects anything real-data-facing is loadForecast()'s
// merge and this "activate permanently" copy. Revalidating broadly here is
// cheap insurance against missing one.
const AFFECTED_PATHS = ["/", "/forecast", "/calendar", "/scenarios"];

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

  // Cascade deletes scenario_recurring_items/scenario_one_off_items
  // automatically (migration 0033); preferences.active_scenario_id is ON
  // DELETE SET NULL, so deleting the active scenario just turns scenario
  // mode off rather than leaving a dangling reference.
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

// T174: the one on/off switch, per the user's own "toggle it on or off
// whenever" framing - only one scenario can be active at a time, so
// activating a different one implicitly deactivates whichever was active
// before (a plain preferences update, not a two-step operation).
export async function setActiveScenario(formData: FormData) {
  // Empty string (not present at all) turns scenario mode off - the form
  // that deactivates submits an explicit "" rather than omitting the field,
  // so this one action handles both directions the same way
  // setReminderCompleted's "completed" field does.
  const scenarioId = (formData.get("scenarioId") as string) || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("preferences").update({ active_scenario_id: scenarioId }).eq("user_id", user.id);

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

  const [scenarioRes, recurringRes, oneOffRes] = await Promise.all([
    supabase.from("scenarios").select("name").eq("id", id).single(),
    supabase
      .from("scenario_recurring_items")
      .select(
        "name, type, amount, comments, balance_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count",
      )
      .eq("scenario_id", id),
    supabase.from("scenario_one_off_items").select("name, amount, due_date, comments, balance_id").eq("scenario_id", id),
  ]);
  if (recurringRes.error) return { error: recurringRes.error.message };
  if (oneOffRes.error) return { error: oneOffRes.error.message };

  const recurringToInsert = (recurringRes.data ?? []).map((row) => ({ ...row, user_id: user.id }));
  const oneOffsToInsert = (oneOffRes.data ?? []).map((row) => ({ ...row, user_id: user.id }));

  if (recurringToInsert.length > 0) {
    const { error } = await supabase.from("recurring_items").insert(recurringToInsert);
    if (error) return { error: error.message };
  }
  if (oneOffsToInsert.length > 0) {
    const { error } = await supabase.from("one_off_items").insert(oneOffsToInsert);
    if (error) return { error: error.message };
  }

  // Deleting the scenario cascades its own scenario_recurring_items/
  // scenario_one_off_items rows away, and (ON DELETE SET NULL) turns off
  // scenario mode if this was the active one.
  const { error: deleteError } = await supabase.from("scenarios").delete().eq("id", id);
  if (deleteError) return { error: deleteError.message };

  await logActivity(supabase, user.id, {
    action: "update",
    entityType: "misc",
    entityName: `Scenario: ${scenarioRes.data?.name ?? "Untitled"}`,
    detail: `Activated permanently - ${recurringToInsert.length + oneOffsToInsert.length} item(s) made real`,
  });

  for (const path of [...AFFECTED_PATHS, "/bills", "/income", "/debt", "/savings", "/misc"]) revalidatePath(path);
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
  if (amountPesos === null || amountPesos === 0) return { error: "Enter a valid amount." } as const;
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

  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
  return { error: null };
}

export async function deleteScenarioItem(formData: FormData) {
  const id = formData.get("id") as string;
  const scenarioId = formData.get("scenarioId") as string;
  const supabase = await createClient();
  await supabase.from("scenario_recurring_items").delete().eq("id", id);
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
  if (magnitude === null || magnitude === 0) return { error: "Enter a valid amount." } as const;
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

  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
  return { error: null };
}

export async function deleteScenarioOneOff(formData: FormData) {
  const id = formData.get("id") as string;
  const scenarioId = formData.get("scenarioId") as string;
  const supabase = await createClient();
  await supabase.from("scenario_one_off_items").delete().eq("id", id);
  revalidatePath(`/scenarios/${scenarioId}`);
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}
