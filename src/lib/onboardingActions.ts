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
import { createExtra } from "@/app/(app)/misc/actions";

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

// T115: "Start guided setup" - lets a user run the setup walkthrough on
// purpose, clearing any previously-skipped optional steps so it behaves
// like a fresh signup's.
//
// T123: was `restartRequiredOnboarding`. It used to flip the hard-gate flags
// and force `onboarding_wizard_state = "prompt:accounts"` - the direct cause
// of Bug #5, since that state renders as "Account added. Add another?" even
// on an account containing nothing. That force existed to stop the wizard
// self-completing for a user who already had data (T116), a problem that
// only existed because the wizard was a gate that had to decide whether to
// let you through. Now that guided setup is an ordinary page, there's no
// gate to flip and nothing to force: the wizard shows whatever the account
// actually contains.
export async function startGuidedSetup() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({
      onboarding_skipped_steps: [],
      onboarding_wizard_state: null,
      // T119: stamps the welcome-choice too, whichever of the three entry
      // points (Settings, the welcome modal, the tour's own "prefer
      // step-by-step setup" link) called this - so the welcome modal never
      // reappears later and the tour (which only auto-shows when the choice
      // is "tour") stops competing with guided setup.
      onboarding_choice: "guided_setup",
    })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
  redirect("/setup");
}

// T119: the first-login "welcome" modal's three choices, plus the tour's
// own resumable step tracking - separate from T115's required-onboarding
// state above, but following the same pattern (server-persisted, so it
// survives logout/closing the browser rather than living only in
// localStorage the way the tour used to).

export async function chooseTour() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({ onboarding_choice: "tour", onboarding_tour_step: 0 })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
}

export async function skipWelcome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("preferences").update({ onboarding_choice: "skipped" }).eq("user_id", user.id);
  revalidatePath("/", "layout");
}

// Fired on every tour Next/Back click - deliberately no `revalidatePath`
// here (unlike the actions above), since this fires far more often than a
// page navigation actually needs a fresh server render for; the tour's own
// client state already reflects the new step immediately.
export async function saveTourStep(step: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("preferences").update({ onboarding_tour_step: step }).eq("user_id", user.id);
}

// Called once the tour's last step finishes (Skip or Done) - clears the
// in-progress step (so a future login doesn't try to resume a finished
// tour) and, only the very first time, stamps `onboarding_tour_completed_at`
// so a later replay (`replayTour` below) doesn't re-trigger the same
// once-only end-of-tour prompts.
export async function finishTour(wasFirstCompletion: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({
      onboarding_tour_step: null,
      ...(wasFirstCompletion ? { onboarding_tour_completed_at: new Date().toISOString() } : {}),
    })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
}

// Settings' "Review the tour" - resets the choice/step so the tour replays
// from the top; deliberately leaves `onboarding_tour_completed_at` alone so
// this replay doesn't re-show the once-only end-of-tour prompts.
export async function replayTour() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({ onboarding_choice: "tour", onboarding_tour_step: 0 })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
  redirect("/?preview=1");
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
