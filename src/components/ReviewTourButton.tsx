"use client";

import { useRouter } from "next/navigation";

// T100/T110: the only way to replay the intro tours was previously via
// ?preview=1 (which forces replay but also swaps in fixture data and
// disables real interactions) or manually clearing localStorage. This
// clears every tour's "done" flag (each SpotlightTour instance reads its
// own via `orium.tour.<id>.done`, src/components/SpotlightTour.tsx) and
// sends the user to Dashboard, so the whole chained walkthrough (T110:
// Dashboard -> Forecast -> Accounts -> Bills -> Income -> Debt -> Savings ->
// Budgets -> Misc -> Settings) replays from the top exactly as it would for
// a brand-new account.
const TOUR_DONE_KEYS = [
  "orium.tour.dashboard-intro.done",
  "orium.tour.forecast-intro.done",
  "orium.tour.accounts-intro.done",
  "orium.tour.bills-intro.done",
  "orium.tour.income-intro.done",
  "orium.tour.debt-intro.done",
  "orium.tour.savings-intro.done",
  "orium.tour.budgets-intro.done",
  "orium.tour.misc-intro.done",
  "orium.tour.settings-intro.done",
];

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
