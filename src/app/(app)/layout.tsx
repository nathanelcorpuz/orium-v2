import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/displayName";
import { AppShell } from "@/components/AppShell";
import { OnboardingWizard } from "@/components/OnboardingWizard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profileName = (user?.user_metadata?.name as string | undefined) ?? "";
  const greetingName = displayName(profileName, user?.email);

  const { data: prefs } = await supabase
    .from("preferences")
    .select(
      "onboarding_required_completed, onboarding_skipped_steps, onboarding_dismissed_at, onboarding_wizard_state, sample_data_seeded_at, onboarding_choice, onboarding_tour_step, onboarding_tour_completed_at",
    )
    .single();

  // T115: required onboarding wizard - a hard block on every page under
  // (app)/* until Accounts/Bills/Income each have at least one real row.
  // `prefs` can be null for a request that races the preferences row's own
  // creation (`ensureUserPreferences`) - treated as "not required" rather
  // than blocking, since that's a transient state, not a real new signup.
  // A user who explicitly dismissed the wizard (`onboarding_dismissed_at`
  // set, via "Exit setup for now") is let through too, even though it's
  // not actually complete - Settings' "Continue guided setup" clears the
  // dismissal to bring the block back, resuming at the same step.
  if (prefs && prefs.onboarding_required_completed === false && !prefs.onboarding_dismissed_at) {
    // T115 follow-up (user request 2026-07-26): the wizard's "add another?"
    // interstitial shows a preview of what was just added, editable inline -
    // full rows (not just counts), fetched with the same column lists each
    // real page already uses so the same modal components can edit them.
    const [recurringRes, balancesRes, budgetsRes, extrasRes] = await Promise.all([
      supabase
        .from("recurring_items")
        .select(
          "id, name, type, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments, balance_id",
        )
        .order("start_date", { ascending: true }),
      supabase.from("balances").select("id, name, amount, comments").order("name", { ascending: true }),
      supabase
        .from("budgets")
        .select(
          "id, name, monthly_allocation, allocation, created_at, linked_income_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count",
        )
        .order("name", { ascending: true }),
      supabase
        .from("one_off_items")
        .select("id, name, amount, due_date, comments, balance_id")
        .order("due_date", { ascending: true }),
    ]);

    const recurring = recurringRes.data ?? [];
    const bills = recurring.filter((r) => r.type === "bill");
    const income = recurring.filter((r) => r.type === "income");
    const debt = recurring.filter((r) => r.type === "debt");
    const savings = recurring.filter((r) => r.type === "savings");
    const balances = balancesRes.data ?? [];
    const budgets = budgetsRes.data ?? [];
    const extras = extrasRes.data ?? [];

    return (
      <OnboardingWizard
        hasAccounts={balances.length > 0}
        hasBills={bills.length > 0}
        hasIncome={income.length > 0}
        hasDebt={debt.length > 0}
        hasSavings={savings.length > 0}
        hasBudgets={budgets.length > 0}
        hasExtras={extras.length > 0}
        skippedSteps={prefs.onboarding_skipped_steps ?? []}
        wizardState={prefs.onboarding_wizard_state ?? null}
        balances={balances}
        bills={bills}
        income={income}
        debt={debt}
        savings={savings}
        budgets={budgets}
        extras={extras}
        incomeOptions={income.map((i) => ({ id: i.id, name: i.name }))}
      />
    );
  }

  return (
    <AppShell
      greetingName={greetingName}
      sampleDataSeededAt={prefs?.sample_data_seeded_at ?? null}
      // Bugfix: `prefs?.onboarding_choice ?? "skipped"` would have coerced a
      // legitimate `null` (meaning "not decided yet, show the welcome
      // modal") into "skipped" too, since `??` can't tell "prefs is
      // missing" apart from "the field itself is null" - only fall back to
      // "skipped" when the whole row is missing (the same transient-race
      // case handled above), not when it's genuinely unset.
      onboardingChoice={prefs ? prefs.onboarding_choice : "skipped"}
      onboardingTourStep={prefs?.onboarding_tour_step ?? null}
      onboardingTourCompletedAt={prefs?.onboarding_tour_completed_at ?? null}
    >
      {children}
    </AppShell>
  );
}
