"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createBalance } from "@/app/(app)/accounts/actions";
import { createBill } from "@/app/(app)/bills/actions";
import { createIncome } from "@/app/(app)/income/actions";
import { createDebt } from "@/app/(app)/debt/actions";
import { createSavings } from "@/app/(app)/savings/actions";
import { createBudget } from "@/app/(app)/budgets/actions";
import { createExtra } from "@/app/(app)/extra/actions";

// T115: the required onboarding wizard's own persisted state - separate
// from the skippable tour (T110). `onboarding_required_completed` and
// `onboarding_skipped_steps` live on `preferences` (migration 0019).

export async function skipOnboardingStep(stepKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: prefs } = await supabase
    .from("preferences")
    .select("onboarding_skipped_steps")
    .eq("user_id", user.id)
    .single();
  const current = prefs?.onboarding_skipped_steps ?? [];
  if (!current.includes(stepKey)) {
    await supabase
      .from("preferences")
      .update({ onboarding_skipped_steps: [...current, stepKey] })
      .eq("user_id", user.id);
  }
  revalidatePath("/", "layout");
}

export async function completeRequiredOnboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({ onboarding_required_completed: true, onboarding_wizard_state: null })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
}

// T115: "Start guided setup" in Settings - lets a user who already
// completed (or was grandfathered past) the required wizard run it again
// on purpose. Clears the completion flag, any previously-skipped optional
// steps, and any paused-dismissal, so it behaves exactly like a fresh
// signup's wizard.
export async function restartRequiredOnboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({
      onboarding_required_completed: false,
      onboarding_skipped_steps: [],
      onboarding_dismissed_at: null,
      onboarding_wizard_state: null,
    })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
  redirect("/");
}

// T115 follow-up (user request 2026-07-26): "add another?" after each save
// instead of auto-advancing. Server-persisted rather than client state or a
// URL param - see migration 0021's header for why those didn't work.
export async function setWizardPrompt(stepKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({ onboarding_wizard_state: `prompt:${stepKey}` })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
}

export async function setWizardReopen(stepKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({ onboarding_wizard_state: `reopen:${stepKey}` })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
}

export async function clearWizardState() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({ onboarding_wizard_state: null })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
}

// T115 follow-up (user request 2026-07-26): "Exit setup for now" inside the
// wizard itself - a completely new user might want to explore the app
// before committing to guided setup, and a true no-escape hard block could
// steer them away entirely. Setting `onboarding_dismissed_at` stops the
// `(app)/layout.tsx` guard from blocking, without touching
// `onboarding_required_completed` or `onboarding_skipped_steps` - so
// whatever progress already exists (real rows added, steps explicitly
// skipped) is exactly what "Continue guided setup" in Settings resumes
// into later, at the same step they left off on.
export async function dismissOnboardingSetup() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({ onboarding_dismissed_at: new Date().toISOString() })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
}

// T115 follow-up: "Continue guided setup" in Settings - the resumable
// counterpart to `dismissOnboardingSetup`. Only clears the dismissal, so
// the wizard picks back up at the first still-incomplete step rather than
// restarting (that's `restartRequiredOnboarding`'s job instead).
export async function resumeOnboardingSetup() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({ onboarding_dismissed_at: null })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
  redirect("/");
}

async function markWizardStepSaved(stepKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({ onboarding_wizard_state: `prompt:${stepKey}` })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
}

// T115 follow-up: wraps each real create action so the "add another?"
// interstitial trigger (`onboarding_wizard_state`) is written to the
// database in the SAME request as the actual row - atomically, server-side.
// This exists because relying on the modal's own `onSaved` client callback
// was empirically unreliable (see BalanceModal.tsx's comment): the create
// action's own `revalidatePath` call can cause Next.js to refresh/remount
// the wizard before that callback's component ever observes success. Each
// wrapper is passed to its modal via the `createActionOverride` prop -
// normal (non-wizard) usage of these modals is completely untouched, since
// they still default to the plain create action.
export async function createBalanceForWizard(
  prevState: Awaited<ReturnType<typeof createBalance>>,
  formData: FormData,
) {
  const result = await createBalance(prevState, formData);
  if (!result.error) await markWizardStepSaved("accounts");
  return result;
}

export async function createBillForWizard(
  prevState: Awaited<ReturnType<typeof createBill>>,
  formData: FormData,
) {
  const result = await createBill(prevState, formData);
  if (!result.error) await markWizardStepSaved("bills");
  return result;
}

export async function createIncomeForWizard(
  prevState: Awaited<ReturnType<typeof createIncome>>,
  formData: FormData,
) {
  const result = await createIncome(prevState, formData);
  if (!result.error) await markWizardStepSaved("income");
  return result;
}

export async function createDebtForWizard(
  prevState: Awaited<ReturnType<typeof createDebt>>,
  formData: FormData,
) {
  const result = await createDebt(prevState, formData);
  if (!result.error) await markWizardStepSaved("debt");
  return result;
}

export async function createSavingsForWizard(
  prevState: Awaited<ReturnType<typeof createSavings>>,
  formData: FormData,
) {
  const result = await createSavings(prevState, formData);
  if (!result.error) await markWizardStepSaved("savings");
  return result;
}

export async function createBudgetForWizard(
  prevState: Awaited<ReturnType<typeof createBudget>>,
  formData: FormData,
) {
  const result = await createBudget(prevState, formData);
  if (!result.error) await markWizardStepSaved("budgets");
  return result;
}

export async function createExtraForWizard(
  prevState: Awaited<ReturnType<typeof createExtra>>,
  formData: FormData,
) {
  const result = await createExtra(prevState, formData);
  if (!result.error) await markWizardStepSaved("misc");
  return result;
}
