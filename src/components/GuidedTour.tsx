"use client";

import { useState } from "react";
import { SpotlightTour, type TourStep } from "./SpotlightTour";
import { SampleDataDecisionModal } from "./SampleDataDecisionModal";
import { GuidedSetupOfferModal } from "./GuidedSetupOfferModal";
import { OnboardingWelcomeModal } from "./OnboardingWelcomeModal";
import { chooseTour, finishTour, restartRequiredOnboarding, saveTourStep, skipWelcome } from "@/lib/onboardingActions";

// T117 (user request 2026-07-26, replacing the old T110/T116 per-page tour
// chain): a single, short, four-moment tour instead of a walkthrough of
// every page - Dashboard intro -> add accounts -> add the rest of your
// finance info -> the forecast table. Mounted once in AppShell.tsx (not
// per-page), so it persists across navigation - see SpotlightTour.tsx's own
// notes on how a step whose target isn't on the current page goes dormant
// rather than skipping or ending.
const GUIDED_TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Orium",
    body: "See the future of your cash flow at any point in time.",
    secondaryAction: {
      label: "Prefer step-by-step setup instead?",
      onClick: () => {
        void restartRequiredOnboarding();
      },
    },
  },
  {
    target: '[data-tour="nav-accounts"], [data-tour="nav-menu"]',
    title: "Add your accounts",
    body: "Track where all your cash lives.",
    href: "/accounts",
    nextLabel: "Go to Accounts",
  },
  {
    target: '[data-tour-group="finance"], [data-tour="nav-menu"]',
    multi: true,
    title: "Add your finance info",
    body: "Add bills, income, debt, savings, budgets, and misc to build your forecast.",
  },
  {
    target: '[data-tour="forecast-content"]',
    title: "Your forecast table",
    body: "Manage every upcoming payment and see how much you'll have at any point in time.",
  },
];

// T119 (user request 2026-07-26): a first-time login now opens with a
// welcome choice (this tour vs. the guided-setup wizard) instead of the
// tour just auto-starting, and progress through whichever path is chosen is
// persisted server-side (`preferences.onboarding_choice`/
// `onboarding_tour_step`) so it survives logging out or closing the browser
// - not just a localStorage flag on one device the way the tour used to
// track itself.
export function GuidedTour({
  sampleDataSeededAt,
  onboardingChoice,
  onboardingTourStep,
  onboardingTourCompletedAt,
}: {
  sampleDataSeededAt: string | null;
  // null = brand-new account, hasn't been asked yet (show the welcome
  // modal); 'tour' | 'guided_setup' | 'skipped' once they've picked.
  onboardingChoice: string | null;
  onboardingTourStep: number | null;
  onboardingTourCompletedAt: string | null;
}) {
  const [choice, setChoice] = useState(onboardingChoice);
  const [tourStep, setTourStep] = useState(onboardingTourStep ?? 0);
  // Bugfix: `finishTour`'s own `revalidatePath` refetches the layout with a
  // fresh `onboardingTourStep: null` prop shortly after Done is clicked -
  // gating the whole return block (including the end-of-tour modals below)
  // on that prop unmounted the modals the instant the revalidated prop
  // arrived, before they'd had a chance to be seen. `tourFinished` is local
  // state instead, flipped synchronously in `onFinish` alongside showing a
  // modal, so the tour's own visibility and the modals' visibility are
  // decoupled from server revalidation timing entirely.
  const [tourFinished, setTourFinished] = useState(false);
  const [showSampleDecision, setShowSampleDecision] = useState(false);
  const [showSetupOffer, setShowSetupOffer] = useState(false);

  if (choice === null) {
    return (
      <OnboardingWelcomeModal
        onChooseTour={() => {
          void chooseTour();
          setTourStep(0);
          setChoice("tour");
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
  // OnboardingWizard *instead of* AppShell/this component while it's
  // active - so there's nothing for this component to render for that
  // choice. "skipped" means nothing to show either.
  const tourActive = choice === "tour" && onboardingTourStep !== null && !tourFinished;

  return (
    <>
      {tourActive && (
        <SpotlightTour
          steps={GUIDED_TOUR_STEPS}
          initialStepIndex={tourStep}
          onStepChange={(index) => void saveTourStep(index)}
          onFinish={() => {
            const wasFirstCompletion = onboardingTourCompletedAt === null;
            void finishTour(wasFirstCompletion);
            setTourFinished(true);
            // T102-style end-of-tour prompts: sample-data keep/reset first
            // (if there's sample data to decide about), then the opt-in
            // guided-setup offer - each shown at most once, ever (a later
            // replay via Settings' "Review the tour" won't re-trigger
            // these, since `onboardingTourCompletedAt` is only set on first
            // finish).
            if (wasFirstCompletion) {
              if (sampleDataSeededAt) setShowSampleDecision(true);
              else setShowSetupOffer(true);
            }
          }}
        />
      )}
      {showSampleDecision && (
        <SampleDataDecisionModal
          onClose={() => {
            setShowSampleDecision(false);
            setShowSetupOffer(true);
          }}
        />
      )}
      {showSetupOffer && <GuidedSetupOfferModal onClose={() => setShowSetupOffer(false)} />}
    </>
  );
}
