import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import { ProfileForm } from "./ProfileForm";
import { PreferencesForm } from "./PreferencesForm";
import { DeleteAccountButton } from "./DeleteAccountModal";
import { SampleDataActions } from "./SampleDataActions";
import { ReviewTourButton } from "@/components/ReviewTourButton";
import { restartRequiredOnboarding, resumeOnboardingSetup } from "@/lib/onboardingActions";
import { DEFAULT_TIER_LABELS } from "@/lib/balanceColor";

const DEFAULT_BALANCE_RANGES = [0, 500000, 2000000, 5000000, 10000000];

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: userData }, preferencesRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("preferences")
      .select("currency, balance_ranges, balance_tier_labels, onboarding_required_completed")
      .single(),
  ]);

  const user = userData.user;
  const name = (user?.user_metadata?.name as string | undefined) ?? "";
  const currency = preferencesRes.data?.currency ?? "₱";
  const balanceRanges = preferencesRes.data?.balance_ranges ?? DEFAULT_BALANCE_RANGES;
  const tierLabels = preferencesRes.data?.balance_tier_labels ?? DEFAULT_TIER_LABELS;
  // T115: Settings is only reachable with required onboarding still
  // incomplete via an explicit "Exit setup for now" dismissal - so
  // "incomplete" here specifically means "paused, safe to resume" rather
  // than "currently blocked" (a genuinely blocked user never sees this page).
  const onboardingPaused = preferencesRes.data?.onboarding_required_completed === false;

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-6 text-xl font-semibold text-notion-text">Settings</h1>

        <div className="space-y-6">
          <ProfileForm email={user?.email ?? ""} name={name} />
          <PreferencesForm currency={currency} balanceRanges={balanceRanges} tierLabels={tierLabels} />

          <div id="sample-data" className="rounded-lg border border-notion-hairline bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold text-notion-text">Sample data</h2>
            <p className="mb-3 text-sm text-slate-600">
              Bring back the sample dataset to explore the app, or clear everything out to start
              entering your own.
            </p>
            <SampleDataActions showPreviewLink />
          </div>

          <div data-tour="settings-help" className="rounded-lg border border-notion-hairline bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold text-notion-text">Help</h2>
            <p className="mb-3 text-sm text-slate-600">
              Replay the full guided walkthrough, from your Dashboard all the way through every
              page - or step back through guided setup to add accounts, bills, and income.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ReviewTourButton />
              {onboardingPaused && (
                <form action={resumeOnboardingSetup}>
                  <button
                    type="submit"
                    className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
                  >
                    Continue guided setup
                  </button>
                </form>
              )}
              <form action={restartRequiredOnboarding}>
                <button
                  type="submit"
                  className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
                >
                  {onboardingPaused ? "Start over" : "Start guided setup"}
                </button>
              </form>
            </div>
          </div>

          <div className="rounded-lg border border-notion-hairline bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-notion-text">Account</h2>
            <div className="flex flex-wrap items-center gap-3">
              <form action={logout}>
                <button type="submit" className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90">
                  Log out
                </button>
              </form>
              <DeleteAccountButton />
            </div>
          </div>

          <div className="flex gap-4 text-sm text-slate-500">
            <Link href="/terms" className="underline">
              Terms of Service
            </Link>
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
