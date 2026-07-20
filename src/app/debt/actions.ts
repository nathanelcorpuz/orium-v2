"use server";

import {
  createMonthlyGoal,
  updateMonthlyGoal,
  deleteMonthlyGoal,
  type RecurringItemActionState,
} from "@/lib/recurringItem";

export async function createDebt(
  _prevState: RecurringItemActionState,
  formData: FormData,
): Promise<RecurringItemActionState> {
  return createMonthlyGoal("debt", "/debt", formData);
}

export async function updateDebt(
  _prevState: RecurringItemActionState,
  formData: FormData,
): Promise<RecurringItemActionState> {
  return updateMonthlyGoal("/debt", formData);
}

export async function deleteDebt(formData: FormData) {
  await deleteMonthlyGoal("/debt", formData);
}
