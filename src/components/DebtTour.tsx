"use client";

import { SpotlightTour, type TourStep } from "./SpotlightTour";

// T110: continues the guided app walkthrough from Income.
const DEBT_STEPS: TourStep[] = [
  {
    target: '[data-tour="debt-header"]',
    title: "Track your debt",
    body: "Add loans, credit cards, or anything you're paying off. Orium tracks your remaining balance and payoff progress. Click any entry to edit or delete it.",
  },
  {
    target: '[data-tour="nav-savings"], [data-tour="nav-menu"]',
    title: "Continue to Savings",
    body: "Next, set up a savings goal. Click Savings in the sidebar (or the menu icon on mobile) to continue.",
  },
];

export function DebtTour() {
  return <SpotlightTour tourId="debt-intro" steps={DEBT_STEPS} />;
}
