"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { wipeFinancialData } from "@/lib/wipeFinancialData";
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
//
// Bugfix (user report 2026-07-26): with `onboarding_wizard_state` left
// null, a user who already has real accounts/bills/income (true for
// virtually anyone who'd click this - it's only reachable once already
// using the app) saw the wizard compute "nothing left to do" and
// self-complete instantly, before ever rendering - clicking the button
// appeared to do nothing but bounce back to the Dashboard. Forcing
// `prompt:accounts` guarantees the wizard actually shows something (the
// Accounts step's review screen, previewing whatever already exists with
// Edit/"Add another") on the very first render, regardless of existing data.
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
      onboarding_wizard_state: "prompt:accounts",
      // T119: stamps the welcome-choice too, whichever of the three entry
      // points (Settings, the welcome modal, the tour's own "prefer
      // step-by-step setup" link) called this - so the welcome modal never
      // reappears later and the tour (which only auto-shows when the choice
      // is "tour") stops competing with guided setup.
      onboarding_choice: "guided_setup",
    })
    .eq("user_id", user.id);
  revalidatePath("/", "layout");
  redirect("/");
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

// T120 (user request 2026-07-26): the persistent post-tour prompt's three
// choices, plus its small dismiss. Server-persisted (migration 0024) rather
// than client state because the prompt has to follow the user across every
// page AND survive a reload until they actually pick something.

async function setPostTourChoice(choice: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await supabase
    .from("preferences")
    .update({ onboarding_post_tour_choice: choice })
    .eq("user_id", user.id);
  return { supabase, user };
}

// "Explore with test data" - seeds the real sample dataset into the account
// (wipe-then-seed, the same way Settings' "Restore sample data" does) so
// they can click around live rows instead of the tour's read-only fixture.
// No typed confirmation here, unlike Settings' version: this is only ever
// reachable straight off a brand-new account's first tour, where there's
// nothing of the user's own to lose.
export async function choosePostTourTestData() {
  const result = await setPostTourChoice("test_data");
  if (!result) return;
  const { supabase, user } = result;

  const wipeError = await wipeFinancialData(supabase, user.id);
  if (wipeError) return;

  const { error: seedError } = await supabase.rpc("seed_sample_data", { target_user: user.id });
  if (seedError) return;

  await supabase
    .from("preferences")
    .update({ sample_data_seeded_at: new Date().toISOString() })
    .eq("user_id", user.id);

  revalidatePath("/", "layout");
  redirect("/");
}

// "I'll enter my own data" - nothing to set up, just records the choice and
// drops back to a plain (non-preview) Dashboard.
export async function choosePostTourOwnData() {
  await setPostTourChoice("own_data");
  revalidatePath("/", "layout");
  redirect("/");
}

// "Walk me through it" - records the choice, then hands off to the same
// guided-setup wizard Settings and the welcome modal already use.
export async function choosePostTourGuidedSetup() {
  await setPostTourChoice("guided_setup");
  await restartRequiredOnboarding();
}

// The small close button - stops the prompt showing without committing to
// any of the three; Settings > Help brings the same options back.
export async function dismissPostTourPrompt() {
  await setPostTourChoice("dismissed");
  revalidatePath("/", "layout");
}

// Settings > Help: "Show setup options again" - puts the prompt back, which
// is what the prompt's own closing line promises.
export async function reopenPostTourPrompt() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("preferences")
    .update({ onboarding_post_tour_choice: null })
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
