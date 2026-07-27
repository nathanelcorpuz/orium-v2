import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import { ProfileForm } from "./ProfileForm";
import { PreferencesForm } from "./PreferencesForm";
import { DeleteAccountButton } from "./DeleteAccountModal";
import { SampleDataActions } from "./SampleDataActions";
import { ReviewTourButton } from "@/components/ReviewTourButton";
import { restoreFormTips } from "@/lib/formTipActions";
import { DEFAULT_TIER_LABELS } from "@/lib/balanceColor";

const DEFAULT_BALANCE_RANGES = [0, 500000, 2000000, 5000000, 10000000];

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: userData }, preferencesRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("preferences")
      .select("currency, balance_ranges, balance_tier_labels")
      .single(),
  ]);

  const user = userData.user;
  const name = (user?.user_metadata?.name as string | undefined) ?? "";
  const currency = preferencesRes.data?.currency ?? "₱";
  const balanceRanges = preferencesRes.data?.balance_ranges ?? DEFAULT_BALANCE_RANGES;
  const tierLabels = preferencesRes.data?.balance_tier_labels ?? DEFAULT_TIER_LABELS;

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
              Take the quick tour, walk through guided setup again, or bring back anything
              you&rsquo;ve dismissed - form tips and sidebar shortcuts alike.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ReviewTourButton />
              {/* T123: was two buttons ("Continue guided setup" / "Start
                  over") whose labels depended on a paused-gate flag that no
                  longer exists, plus a third ("Show setup options") that
                  reopened the deleted post-tour prompt. Guided setup is just
                  a page now, so one link covers every case: it resumes at
                  whatever step is still unresolved. */}
              <Link
                href="/setup"
                className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
              >
                Guided setup
              </Link>
              {/* T120 follow-up: "don't show this tip next time" is per-tip
                  and permanent, so there has to be one way back. Renamed
                  (user request 2026-07-26) since this now also restores the
                  sidebar's "Quick tour"/"Guided setup" shortcuts if hidden -
                  both reuse the same `dismissed_form_tips` store. */}
              <form action={restoreFormTips}>
                <button
                  type="submit"
                  className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
                >
                  Bring back tips &amp; shortcuts
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
