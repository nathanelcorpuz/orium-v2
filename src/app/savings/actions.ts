"use server";

import {
  createMonthlyGoal,
  updateMonthlyGoal,
  deleteMonthlyGoal,
  type RecurringItemActionState,
} from "@/lib/recurringItem";

export async function createSavings(
  _prevState: RecurringItemActionState,
  formData: FormData,
): Promise<RecurringItemActionState> {
  return createMonthlyGoal("savings", "/savings", formData);
}

export async function updateSavings(
  _prevState: RecurringItemActionState,
  formData: FormData,
): Promise<RecurringItemActionState> {
  return updateMonthlyGoal("/savings", formData);
}

export async function deleteSavings(formData: FormData) {
  await deleteMonthlyGoal("/savings", formData);
}
