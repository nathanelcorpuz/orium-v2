"use client";

import { SpotlightTour, type TourStep } from "./SpotlightTour";

// T110 (revised, user request 2026-07-26): a single step spotlighting the
// whole Dashboard content area (everything except the sidebar) instead of
// walking each card individually - a quick "here's the shape of it" intro
// rather than a guided tour of every stat. `data-tour="dashboard-content"`
// lives on page.tsx's own content wrapper, so the sidebar/menu falls
// outside the spotlighted rect and stays dimmed automatically.
const DASHBOARD_STEPS: TourStep[] = [
  {
    target: '[data-tour="dashboard-content"]',
    title: "Welcome to your Dashboard",
    body: "This is your Dashboard - it shows your total balance, bills, and income at a glance. These fill in as you add accounts, bills, and income. Click Forecast to continue.",
    // T110 bugfix (user report 2026-07-26): the whole-page target isn't a
    // clickable nav link, so "Done" needs to navigate itself.
    href: "/forecast",
  },
];

export function DashboardTour({ forceActive }: { forceActive?: boolean }) {
  return <SpotlightTour tourId="dashboard-intro" steps={DASHBOARD_STEPS} forceActive={forceActive} />;
}
