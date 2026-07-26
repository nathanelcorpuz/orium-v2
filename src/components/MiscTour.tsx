"use client";

import { SpotlightTour, type TourStep } from "./SpotlightTour";

// T110: continues the guided app walkthrough from Budgets. Tour id/copy use
// "Misc" (T106's user-facing rename); the route itself is still `/extra`.
const MISC_STEPS: TourStep[] = [
  {
    target: '[data-tour="misc-header"]',
    title: "Add one-off items",
    body: "Misc is for one-off transactions that don't repeat - a big purchase, a one-time gift, anything with just one due date. Click any item to edit or delete it.",
  },
  {
    target: '[data-tour="nav-settings"], [data-tour="nav-menu"]',
    title: "Continue to Settings",
    body: "Last stop: your account settings. Click Settings in the sidebar (or the menu icon on mobile) to continue.",
  },
];

export function MiscTour() {
  return <SpotlightTour tourId="misc-intro" steps={MISC_STEPS} />;
}
