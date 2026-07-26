"use client";

import { useState } from "react";
import { SpotlightTour, type TourStep } from "./SpotlightTour";
import { SampleDataDecisionModal } from "./SampleDataDecisionModal";
import { GuidedSetupOfferModal } from "./GuidedSetupOfferModal";
import { restartRequiredOnboarding } from "@/lib/onboardingActions";

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

export function GuidedTour({ sampleDataSeededAt }: { sampleDataSeededAt: string | null }) {
  const [showSampleDecision, setShowSampleDecision] = useState(false);
  const [showSetupOffer, setShowSetupOffer] = useState(false);

  return (
    <>
      <SpotlightTour
        tourId="guided-tour"
        steps={GUIDED_TOUR_STEPS}
        onFinish={(wasFirstCompletion) => {
          if (!wasFirstCompletion) return;
          // T102-style end-of-tour prompts: sample-data keep/reset first (if
          // there's sample data to decide about), then the opt-in
          // guided-setup offer - each shown at most once, ever.
          if (sampleDataSeededAt) setShowSampleDecision(true);
          else setShowSetupOffer(true);
        }}
      />
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
