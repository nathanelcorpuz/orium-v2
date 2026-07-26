"use client";

import { SpotlightTour, type TourStep } from "./SpotlightTour";

// T110: the final leg of the guided app walkthrough, continued from Misc.
// Ends here instead of chaining to another nav link - the second step
// deliberately targets the "Help" card (T100's ReviewTourButton) so the
// walkthrough closes by pointing back at how to replay itself.
const SETTINGS_STEPS: TourStep[] = [
  {
    target: '[data-tour="settings-header"]',
    title: "Your settings",
    body: "Set your currency and customize the balance colors and labels used across the Dashboard and Forecast pages here.",
  },
  {
    target: '[data-tour="settings-help"]',
    title: "You're all set",
    body: "That's the whole app! You can replay this walkthrough anytime from here.",
  },
];

export function SettingsTour() {
  return <SpotlightTour tourId="settings-intro" steps={SETTINGS_STEPS} />;
}
