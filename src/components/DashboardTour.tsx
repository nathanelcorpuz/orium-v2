"use client";

import { SpotlightTour, type TourStep } from "./SpotlightTour";

// T104: step order follows the page's own reading order (stats -> Lowest
// Balance Ahead -> Peaks and Drops -> Accounts), which the user request
// 2026-07-26 reordered so the forward-looking numbers read as more
// important than the per-category cards.
const DASHBOARD_STEPS: TourStep[] = [
  {
    target: '[data-tour="dashboard-stats"]',
    title: "Welcome to your Dashboard",
    body: "Here's a quick snapshot: your total balance across every account, your total monthly bills, and your total monthly income.",
  },
  {
    target: '[data-tour="dashboard-lowest-balance"]',
    title: "Lowest Balance Ahead",
    body: "Orium looks ahead across your whole forecast and warns you about the lowest point your balance is projected to reach, plus the first date it might dip into the red.",
  },
  {
    target: '[data-tour="dashboard-peaks-drops"]',
    title: "Peaks and Drops",
    body: "See your highest and lowest projected balance for every month at a glance.",
  },
  {
    target: '[data-tour="dashboard-accounts"]',
    title: "Your accounts",
    body: "This is where your money lives - bills, debt, and budgets get deducted from an account, and income gets added to one.",
  },
];

export function DashboardTour({ forceActive }: { forceActive?: boolean }) {
  return <SpotlightTour tourId="dashboard-intro" steps={DASHBOARD_STEPS} forceActive={forceActive} />;
}
