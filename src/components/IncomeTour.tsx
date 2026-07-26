"use client";

import { SpotlightTour, type TourStep } from "./SpotlightTour";

// T110: continues the guided app walkthrough from Bills.
const INCOME_STEPS: TourStep[] = [
  {
    target: '[data-tour="income-header"]',
    title: "Add your income",
    body: "Add your salary, freelance income, or anything else that comes in. Choose how often it repeats and which account it's added to. Click any entry to edit or delete it.",
  },
  {
    target: '[data-tour="nav-debt"], [data-tour="nav-menu"]',
    title: "Continue to Debt",
    body: "Next, track any debt you're paying down. Click Debt in the sidebar (or the menu icon on mobile) to continue.",
  },
];

export function IncomeTour() {
  return <SpotlightTour tourId="income-intro" steps={INCOME_STEPS} />;
}
