"use client";

import { SpotlightTour, type TourStep } from "./SpotlightTour";

// T110: continues the guided app walkthrough from Debt.
const SAVINGS_STEPS: TourStep[] = [
  {
    target: '[data-tour="savings-header"]',
    title: "Set savings goals",
    body: "Add a savings goal with a target amount and date. Orium tracks your progress and folds it into your forecast. Click any goal to edit or delete it.",
  },
  {
    target: '[data-tour="nav-budgets"], [data-tour="nav-menu"]',
    title: "Continue to Budgets",
    body: "Next, set up a budget for variable spending. Click Budgets in the sidebar (or the menu icon on mobile) to continue.",
  },
];

export function SavingsTour() {
  return <SpotlightTour tourId="savings-intro" steps={SAVINGS_STEPS} />;
}
