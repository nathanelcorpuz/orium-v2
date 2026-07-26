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
    body: "A quick snapshot: total balance, monthly bills, and monthly income - all sample data for now. These fill in with your numbers as you add accounts, bills, and income.",
  },
  {
    target: '[data-tour="dashboard-lowest-balance"]',
    title: "Lowest Balance Ahead",
    body: "Orium warns you about the lowest point your balance is projected to reach, plus the first date it might dip into the red.",
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
  {
    // T110: chains into the Forecast intro tour - matches either the
    // desktop sidebar's Forecast link or the mobile hamburger button
    // (whichever is actually visible at the current breakpoint; on mobile
    // the sidebar itself is off-canvas until opened, so there's no real
    // Forecast link to spotlight until then).
    target: '[data-tour="nav-forecast"], [data-tour="nav-menu"]',
    title: "Continue to Forecast",
    body: "Forecast lists every upcoming transaction and your running balance over time. Click Forecast in the sidebar (or the menu icon on mobile) to continue there.",
  },
];

export function DashboardTour({ forceActive }: { forceActive?: boolean }) {
  return <SpotlightTour tourId="dashboard-intro" steps={DASHBOARD_STEPS} forceActive={forceActive} />;
}
