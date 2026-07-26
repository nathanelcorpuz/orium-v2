"use client";

import { SpotlightTour, type TourStep } from "./SpotlightTour";

// T110: the guided app walkthrough continues here from the Forecast intro
// tour's final "Continue to Accounts" step. Same auto-show-once pattern as
// every other SpotlightTour (T98) - no shared state needed, since arriving
// on this page via the previous tour's nav-link step is enough to trigger it.
const ACCOUNTS_STEPS: TourStep[] = [
  {
    target: '[data-tour="accounts-header"]',
    title: "Add your accounts",
    body: "Add every bank account, wallet, or cash on hand here with the button above. Once added, click any account in the list to edit or remove it.",
  },
  {
    target: '[data-tour="nav-bills"], [data-tour="nav-menu"]',
    title: "Continue to Bills",
    body: "Next, add your recurring bills. Click Bills in the sidebar (or the menu icon on mobile) to continue.",
  },
];

export function AccountsTour() {
  return <SpotlightTour tourId="accounts-intro" steps={ACCOUNTS_STEPS} />;
}
