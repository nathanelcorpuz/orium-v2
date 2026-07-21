"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";

export type BudgetActionState = { error: string | null };

function readBudgetForm(formData: FormData) {
  const name = (formData.get("name") as string).trim();
  const monthlyAllocation = parseCentavos(formData.get("monthlyAllocationPesos") as string);

  if (!name) return { error: "Name is required." } as const;
  if (monthlyAllocation === null || monthlyAllocation < 0) {
    return { error: "Enter a valid monthly allocation." } as const;
  }

  return { error: null, name, monthlyAllocation } as const;
}

export async function createBudget(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const fields = readBudgetForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("budgets").insert({
    user_id: user.id,
    name: fields.name,
    monthly_allocation: fields.monthlyAllocation,
  });
  if (error) return { error: error.message };

  revalidatePath("/budgets");
  revalidatePath("/");
  return { error: null };
}

export async function updateBudget(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const id = formData.get("id") as string;
  const fields = readBudgetForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("budgets")
    .update({ name: fields.name, monthly_allocation: fields.monthlyAllocation })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/budgets");
  revalidatePath("/");
  return { error: null };
}

export async function deleteBudget(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("budgets").delete().eq("id", id);
  revalidatePath("/budgets");
  revalidatePath("/");
}

function readLogSpendForm(formData: FormData) {
  const amount = parseCentavos(formData.get("amountPesos") as string);
  const entryDate = (formData.get("entryDate") as string) || todayInManila();
  const note = ((formData.get("note") as string) || "").trim() || null;

  if (amount === null || amount <= 0) return { error: "Enter a valid spend amount." } as const;
  if (!entryDate) return { error: "Date is required." } as const;

  return { error: null, amount, entryDate, note } as const;
}

// Logging a spend writes both a budget_entries row and a settlement row
// (SPEC.md budget spend-logging rule) so History stays a complete record of actual
// money movement. There's no forecast row being settled here (budgets
// don't go through the Edit/Settle modal), so forecasted_amount and
// forecasted_balance have no meaningful value - both are 0.
export async function logSpend(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const budgetId = formData.get("budgetId") as string;
  const budgetName = formData.get("budgetName") as string;
  const fields = readLogSpendForm(formData);
  if (fields.error) return { error: fields.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error: entryError } = await supabase.from("budget_entries").insert({
    user_id: user.id,
    budget_id: budgetId,
    entry_date: fields.entryDate,
    amount: fields.amount,
    note: fields.note,
  });
  if (entryError) return { error: entryError.message };

  const { error: settlementError } = await supabase.from("settlements").insert({
    user_id: user.id,
    source_type: "budget",
    source_id: budgetId,
    name: fields.note ? `${budgetName} - ${fields.note}` : budgetName,
    type: "budget",
    forecasted_amount: 0,
    actual_amount: -fields.amount,
    forecasted_date: fields.entryDate,
    actual_date: fields.entryDate,
    forecasted_balance: 0,
  });
  if (settlementError) return { error: settlementError.message };

  revalidatePath("/budgets");
  revalidatePath("/history");
  revalidatePath("/");
  return { error: null };
}
