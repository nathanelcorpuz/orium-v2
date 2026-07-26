"use client";

import { useRouter } from "next/navigation";

// T117: replaced the old T110/T116 per-page tour chain with a single
// "guided-tour" flag (GuidedTour.tsx) - clearing it and sending the user to
// Dashboard replays the whole tour from the top exactly as it would for a
// brand-new account.
export function ReviewTourButton() {
  const router = useRouter();

  function handleClick() {
    localStorage.removeItem("orium.tour.guided-tour.done");
    router.push("/");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
    >
      Review the tour
    </button>
  );
}
