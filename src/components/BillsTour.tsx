"use client";

import { SpotlightTour, type TourStep } from "./SpotlightTour";

// T110: continues the guided app walkthrough from Accounts.
const BILLS_STEPS: TourStep[] = [
  {
    target: '[data-tour="bills-header"]',
    title: "Add your bills",
    body: "Add recurring bills here - rent, subscriptions, insurance. Set how often it repeats and which account it's deducted from. Click any bill to edit or delete it.",
  },
  {
    target: '[data-tour="nav-income"], [data-tour="nav-menu"]',
    title: "Continue to Income",
    body: "Next, add your income. Click Income in the sidebar (or the menu icon on mobile) to continue.",
  },
];

export function BillsTour() {
  return <SpotlightTour tourId="bills-intro" steps={BILLS_STEPS} />;
}
