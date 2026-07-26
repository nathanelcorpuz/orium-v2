"use client";

import { SpotlightTour, type TourStep } from "./SpotlightTour";

// T110: continues the guided app walkthrough from Savings.
const BUDGETS_STEPS: TourStep[] = [
  {
    target: '[data-tour="budgets-header"]',
    title: "Set up a budget",
    body: "Budgets track variable spending like groceries as a running ledger - funded manually, from income, or on a schedule. Click any budget to log a spend or manage it.",
  },
  {
    target: '[data-tour="nav-misc"], [data-tour="nav-menu"]',
    title: "Continue to Misc",
    body: "Next, add any one-off future expenses. Click Misc in the sidebar (or the menu icon on mobile) to continue.",
  },
];

export function BudgetsTour() {
  return <SpotlightTour tourId="budgets-intro" steps={BUDGETS_STEPS} />;
}
