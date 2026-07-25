"use client";

import { SpotlightTour, type TourStep } from "./SpotlightTour";

const DASHBOARD_STEPS: TourStep[] = [
  {
    target: '[data-tour="dashboard-stats"]',
    title: "Welcome to your Dashboard",
    body: "Here's a quick snapshot: your total balance across every account, your total monthly bills, and your total monthly income.",
  },
  {
    target: '[data-tour="dashboard-accounts"]',
    title: "Your accounts",
    body: "This is where your money lives - bills, debt, and budgets get deducted from an account, and income gets added to one.",
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
];

export function DashboardTour({ forceActive }: { forceActive?: boolean }) {
  return <SpotlightTour tourId="dashboard-intro" steps={DASHBOARD_STEPS} forceActive={forceActive} />;
}
