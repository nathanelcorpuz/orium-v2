import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/displayName";
import { AppShell } from "@/components/AppShell";
import { FormTipsProvider } from "@/components/FormTip";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profileName = (user?.user_metadata?.name as string | undefined) ?? "";
  const greetingName = displayName(profileName, user?.email);

  // T123: this used to also fetch the required-onboarding flags plus every
  // financial table, so it could render `OnboardingWizard` *instead of* the
  // app whenever setup was incomplete - a hard block on every route under
  // `(app)/*`. That gate is gone (SPEC.md Phase 18, "The agreed flow"):
  // guided setup is now the ordinary `/setup` page, which fetches its own
  // data. What's left here is only what the shell itself needs.
  const { data: prefs } = await supabase
    .from("preferences")
    .select(
      "onboarding_choice, onboarding_tour_step, onboarding_tour_completed_at, dismissed_form_tips",
    )
    .single();

  return (
    <FormTipsProvider dismissed={prefs?.dismissed_form_tips ?? []}>
      <AppShell
        greetingName={greetingName}
        // `prefs?.onboarding_choice ?? "skipped"` would coerce a legitimate
        // `null` (meaning "not decided yet, show the welcome modal") into
        // "skipped" too, since `??` can't tell "prefs is missing" apart from
        // "the field itself is null" - only fall back when the whole row is
        // missing, which is a transient race with that row's own creation.
        onboardingChoice={prefs ? prefs.onboarding_choice : "skipped"}
        onboardingTourStep={prefs?.onboarding_tour_step ?? null}
        onboardingTourCompletedAt={prefs?.onboarding_tour_completed_at ?? null}
      >
        {children}
      </AppShell>
    </FormTipsProvider>
  );
}
