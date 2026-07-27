"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SpotlightTour, type TourStep } from "./SpotlightTour";
import { OnboardingWelcomeModal } from "./OnboardingWelcomeModal";
import { chooseTour, finishTour, saveTourStep, skipWelcome } from "@/lib/onboardingActions";

// T120 (user request 2026-07-26): a 6-step tour that actually walks the app
// - Dashboard -> Accounts -> Bills -> Forecast -> Settings -> Dashboard -
// rather than pointing at nav links from one page. Every step's Next both
// advances *and* navigates, so the user is always looking at the page being
// described.
//
// Each data page is visited with `?preview=1`, which renders the read-only
// sample fixture (T103, extended to Accounts/Bills in T120): a brand-new
// account is empty, so without placeholders there'd be nothing to point at.
// Nothing shown during the tour is ever written. Settings is deliberately
// visited *without* preview: the preferences shown there are the account's
// real ones, so flagging them as sample data would be a lie.
//
// T123: the first step used to carry a "Prefer step-by-step setup?"
// secondary action, and the tour used to end by showing a three-option
// prompt. Both are gone - the welcome modal already asked which path the
// user wanted, and re-asking mid-tour and again at the end was the single
// biggest source of the "all over the place" feeling (SPEC.md Phase 18).
const GUIDED_TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Orium",
    // The one-line promise the whole product exists to keep: a balance at a
    // future date you can actually point at. Keep this framing wherever
    // Orium introduces itself.
    body: "Orium shows you how much money you'll have at any point in the future. Here's a quick look around.",
    path: "/?preview=1",
  },
  {
    target: '[data-tour="accounts-header"]',
    navKey: 'accounts',
    path: "/accounts?preview=1",
    title: "Your accounts",
    body: "Every bank account, wallet, and cash stash you keep money in. Their total is where your forecast starts.",
  },
  {
    target: '[data-tour="bills-header"]',
    navKey: 'bills',
    path: "/bills?preview=1",
    title: "Your money in and out",
    body: "Bills, income, debt, savings, budgets, and misc all live in their own tab and feed the same forecast.",
  },
  {
    target: '[data-tour="forecast-content"]',
    navKey: 'forecast',
    path: "/forecast?preview=1",
    title: "Your forecast",
    body: "Every upcoming transaction, and what you'll have left on each date. Settle each one as it really happens to keep those numbers honest.",
  },
  {
    target: "#balance-thresholds, #lowest-balance-labels",
    navKey: "settings",
    multi: true,
    path: "/settings",
    title: "Make it yours",
    body: "Set the balance amounts that count as healthy or risky, and the wording used for each.",
  },
  {
    target: '[data-tour="dashboard-peaks-drops"]',
    navKey: 'dashboard',
    path: "/?preview=1",
    title: "Peaks and drops",
    body: "Your highest and lowest balance for every month ahead, so trouble is easy to spot early.",
    nextLabel: "Complete",
  },
];

// T119: a first-time login opens with a welcome choice (this tour, guided
// setup, or neither) instead of the tour auto-starting, and progress is
// persisted server-side (`preferences.onboarding_choice`/
// `onboarding_tour_step`) so it survives logging out or closing the browser.
export function GuidedTour({
  onboardingChoice,
  onboardingTourStep,
  onboardingTourCompletedAt,
}: {
  // null = brand-new account, hasn't been asked yet (show the welcome
  // modal); 'tour' | 'guided_setup' | 'skipped' once they've picked.
  onboardingChoice: string | null;
  onboardingTourStep: number | null;
  onboardingTourCompletedAt: string | null;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState(onboardingChoice);
  const [tourStep, setTourStep] = useState(onboardingTourStep ?? 0);
  // Local, so the tour disappears the instant "Complete" is clicked rather
  // than waiting on `finishTour`'s revalidation round-trip.
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

  // Guided setup (choice === "guided_setup") is just the /setup page now, so
  // there's nothing for this component to render for it.
  const tourActive = choice === "tour" && onboardingTourStep !== null && !justFinished;
  if (!tourActive) return null;

  return (
    <SpotlightTour
      steps={GUIDED_TOUR_STEPS}
      initialStepIndex={tourStep}
      onStepChange={(index) => void saveTourStep(index)}
      onFinish={() => {
        void finishTour(onboardingTourCompletedAt === null);
        setJustFinished(true);
      }}
    />
  );
}
