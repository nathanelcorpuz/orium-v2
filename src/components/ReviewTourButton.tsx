"use client";

import { replayTour } from "@/lib/onboardingActions";

// T119: replaced the localStorage-flag clearing this used (T117) with the
// server-persisted `replayTour` action, so replaying the tour is driven by
// the same `onboarding_choice`/`onboarding_tour_step` state GuidedTour.tsx
// now reads, consistent with how the rest of onboarding resumes.
export function ReviewTourButton() {
  return (
    <form action={replayTour}>
      <button
        type="submit"
        className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
      >
        Review the tour
      </button>
    </form>
  );
}
