"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SpotlightTour, type TourStep } from "./SpotlightTour";
import { OnboardingWelcomeModal } from "./OnboardingWelcomeModal";
import { OnboardingNextStepPrompt } from "./OnboardingNextStepPrompt";
import { chooseTour, finishTour, restartRequiredOnboarding, saveTourStep, skipWelcome } from "@/lib/onboardingActions";

// T120 (user request 2026-07-26, replacing T116/T119's 4-step version): a
// 6-step tour that actually walks the app - Dashboard -> Accounts -> Bills
// -> Forecast -> Settings -> back to Dashboard - rather than pointing at nav
// links from one page. Every step's Next both advances *and* navigates, so
// the user is always looking at the page being described.
//
// Each data page is visited with `?preview=1`, which renders the read-only
// sample fixture (T103, extended to Accounts/Bills in T120): a brand-new
// account is empty, so without placeholders there'd be nothing to point at.
// Nothing shown during the tour is ever written - see PreviewModeBar's copy
// and each page's `previewMode` prop. Settings is deliberately visited
// *without* preview: the preferences shown there are the account's real
// ones, so flagging them as "sample data" would be a lie.
const GUIDED_TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Orium",
    // The one-line promise the whole product exists to keep: a balance at a
    // future date you can actually point at. Keep this framing wherever
    // Orium introduces itself.
    body: "Orium shows you how much money you'll have at any point in the future. Here's a quick look around.",
    href: "/accounts?preview=1",
    secondaryAction: {
      label: "Prefer step-by-step setup?",
      onClick: () => {
        void restartRequiredOnboarding();
      },
    },
  },
  {
    target: '[data-tour="accounts-header"]',
    title: "Your accounts",
    body: "Every bank account, wallet, and cash stash you keep money in. Their total is where your forecast starts.",
    href: "/bills?preview=1",
  },
  {
    target: '[data-tour="bills-header"]',
    title: "Your money in and out",
    body: "Bills, income, debt, savings, budgets, and misc all live in their own tab and feed the same forecast.",
    href: "/forecast?preview=1",
  },
  {
    target: '[data-tour="forecast-content"]',
    title: "Your forecast",
    body: "Every upcoming transaction, and what you'll have left on each date. Settle each one as it really happens to keep those numbers honest.",
    href: "/settings",
  },
  {
    target: "#balance-thresholds, #lowest-balance-labels",
    multi: true,
    title: "Make it yours",
    body: "Set the balance amounts that count as healthy or risky, and the wording used for each.",
    href: "/?preview=1",
  },
  {
    target: '[data-tour="dashboard-peaks-drops"]',
    title: "Peaks and drops",
    body: "Your highest and lowest balance for every month ahead, so trouble is easy to spot early.",
    nextLabel: "Complete",
  },
];

// T119: a first-time login opens with a welcome choice (this tour vs. the
// guided-setup wizard) instead of the tour auto-starting, and progress is
// persisted server-side (`preferences.onboarding_choice`/
// `onboarding_tour_step`) so it survives logging out or closing the browser.
// T120 adds the post-tour "what next?" prompt, likewise server-persisted so
// it follows the user across pages until they pick something.
export function GuidedTour({
  onboardingChoice,
  onboardingTourStep,
  onboardingTourCompletedAt,
  onboardingPostTourChoice,
}: {
  // null = brand-new account, hasn't been asked yet (show the welcome
  // modal); 'tour' | 'guided_setup' | 'skipped' once they've picked.
  onboardingChoice: string | null;
  onboardingTourStep: number | null;
  onboardingTourCompletedAt: string | null;
  // null = show the post-tour prompt; any value = already decided/dismissed.
  onboardingPostTourChoice: string | null;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState(onboardingChoice);
  const [tourStep, setTourStep] = useState(onboardingTourStep ?? 0);
  // Local accelerator so the prompt appears the instant "Complete" is
  // clicked, rather than waiting on `finishTour`'s revalidation round-trip.
  // Gated on the server's own choice still being null below, so a *replay*
  // of an already-decided tour can never resurrect a prompt they've answered.
  const [justFinished, setJustFinished] = useState(false);

  if (choice === null) {
    return (
      <OnboardingWelcomeModal
        onChooseTour={() => {
          void chooseTour();
          setTourStep(0);
          setChoice("tour");
          // Straight into preview so step 1 already has placeholder numbers
          // behind it, matching every later step.
          router.push("/?preview=1");
        }}
        onSkip={() => {
          void skipWelcome();
          setChoice("skipped");
        }}
      />
    );
  }

  // Guided setup (choice === "guided_setup") is handled entirely by
  // (app)/layout.tsx's separate required-onboarding gate, which renders
  // OnboardingWizard *instead of* AppShell/this component while it's active.
  const tourActive = choice === "tour" && onboardingTourStep !== null && !justFinished;
  const promptVisible =
    onboardingPostTourChoice === null && (justFinished || onboardingTourCompletedAt !== null);

  return (
    <>
      {tourActive && (
        <SpotlightTour
          steps={GUIDED_TOUR_STEPS}
          initialStepIndex={tourStep}
          onStepChange={(index) => void saveTourStep(index)}
          onFinish={() => {
            void finishTour(onboardingTourCompletedAt === null);
            setJustFinished(true);
          }}
        />
      )}
      {promptVisible && <OnboardingNextStepPrompt />}
    </>
  );
}
