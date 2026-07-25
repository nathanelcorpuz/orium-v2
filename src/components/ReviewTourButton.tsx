"use client";

import { useRouter } from "next/navigation";

// T100: the only way to replay the Dashboard/Forecast intro tours (T98) was
// previously via ?preview=1 (which forces replay but also swaps in fixture
// data and disables real interactions) or manually clearing localStorage.
// This clears just the two "done" flags SpotlightTour reads
// (src/components/SpotlightTour.tsx) and sends the user to Dashboard, where
// the tour picks up exactly as it would for a brand-new account.
const TOUR_DONE_KEYS = ["orium.tour.dashboard-intro.done", "orium.tour.forecast-intro.done"];

export function ReviewTourButton() {
  const router = useRouter();

  function handleClick() {
    for (const key of TOUR_DONE_KEYS) {
      localStorage.removeItem(key);
    }
    router.push("/");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
    >
      Review the tour again
    </button>
  );
}
