"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { replayTour } from "@/lib/onboardingActions";
import { dismissFormTip } from "@/lib/formTipActions";
import {
  ChecklistIcon,
  ChevronIcon,
  CloseIcon,
  LightbulbIcon,
  LogoMark,
  LogoutIcon,
  MenuIcon,
  NAV_ICONS,
} from "./navIcons";
import { MobileDrawer } from "./MobileDrawer";
import { GuidedTour } from "./GuidedTour";
import { useDismissedTips } from "./FormTip";

// `tourKey` marks a nav item the guided tour (T117) points at individually -
// currently just Accounts, its "add your accounts" step. `financeGroup`
// marks the six nav items its "add your finance info" step highlights all
// at once (rendered as `data-tour-group="finance"`, a separate attribute
// since that step's target selector needs to match all six simultaneously,
// unlike `tourKey`'s one-item-per-value pattern).
// T124: every item now carries a `tourKey`, not just Accounts - a tour step
// highlights the page's own nav item alongside its content, so any page the
// tour visits needs to be addressable as `[data-tour="nav-<key>"]`.
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", tourKey: "dashboard" },
  { href: "/forecast", label: "Forecast", tourKey: "forecast" },
  { href: "/accounts", label: "Accounts", tourKey: "accounts" },
  { href: "/bills", label: "Bills", tourKey: "bills", financeGroup: true },
  { href: "/income", label: "Income", tourKey: "income", financeGroup: true },
  { href: "/debt", label: "Debt", tourKey: "debt", financeGroup: true },
  { href: "/savings", label: "Savings", tourKey: "savings", financeGroup: true },
  { href: "/budgets", label: "Budgets", tourKey: "budgets", financeGroup: true },
  { href: "/misc", label: "Misc", tourKey: "misc", financeGroup: true },
  { href: "/history", label: "History", tourKey: "history" },
  { href: "/settings", label: "Settings", tourKey: "settings" },
];

const COLLAPSED_STORAGE_KEY = "orium.sidebarCollapsed";

// The nav content shared between the desktop rail (collapsible, T44) and the
// mobile drawer (T89, always full-width): header + link list + logout.
// `onNavigate` (drawer only) closes the drawer after a link is tapped;
// `onClose` (drawer only) renders an explicit X next to the header, since a
// backdrop-tap-to-close isn't discoverable on its own.
function SidebarContent({
  collapsed,
  pathname,
  greetingName,
  onNavigate,
  onClose,
}: {
  collapsed: boolean;
  pathname: string;
  greetingName: string;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const dismissedTips = useDismissedTips();
  const [locallyHidden, setLocallyHidden] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  // User request (2026-07-26): "Quick tour" and "Guided setup" can each be
  // hidden from the sidebar with their own small x - reusing
  // `dismissed_form_tips` (see FormTip.tsx's `useDismissedTips`) rather than
  // a new column, since it's already a generic set of dismissed identifiers.
  // `locallyHidden` hides the clicked one immediately, the same optimistic
  // pattern FormTip itself uses, rather than waiting on the server round
  // trip. Both stay reachable regardless from Settings > Help.
  function hideShortcut(key: string) {
    setLocallyHidden((prev) => [...prev, key]);
    startTransition(() => dismissFormTip(key));
  }
  const showQuickTour = !dismissedTips.includes("nav-quick-tour") && !locallyHidden.includes("nav-quick-tour");
  const showGuidedSetup =
    !dismissedTips.includes("nav-guided-setup") && !locallyHidden.includes("nav-guided-setup");

  return (
    <>
      <div className={`flex items-center p-4 ${collapsed ? "justify-center" : "justify-between"}`}>
        {collapsed ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-notion-text text-white">
            <LogoMark className="h-[18px] w-[18px]" />
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <LogoMark className="h-5 w-5 shrink-0 text-notion-text" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-notion-text">Orium</p>
              <p className="truncate text-xs text-slate-500">{greetingName}</p>
            </div>
          </div>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = NAV_ICONS[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              data-tour={item.tourKey ? `nav-${item.tourKey}` : undefined}
              data-tour-group={item.financeGroup ? "finance" : undefined}
              className={`flex items-center gap-2 rounded py-1.5 text-sm ${collapsed ? "justify-center px-2" : "px-3"} ${
                active
                  ? "bg-notion-hover font-medium text-notion-accent"
                  : "text-notion-text hover:bg-notion-hover"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
        {/* T114, renamed "Quick tour" (user request 2026-07-26): sits
            directly below Settings, but unlike every item above it, doesn't
            go to a route - it restarts the guided tour (the same
            `replayTour` action Settings' matching button uses). So it's a
            form-button styled to match the links rather than a Link, and it
            never gets the active-route highlight. Purple-tinted, like
            "Guided setup" below it, so the two read as the app's help
            family - matching FormTip's tint and the tour card's. The "x" is
            a sibling of the submit button, not nested inside it (a button
            can't validly contain another button), positioned on top via the
            shared wrapper's `relative`. */}
        {showQuickTour && (
          <div className="relative">
            <form action={replayTour}>
              <button
                type="submit"
                onClick={onNavigate}
                title={collapsed ? "Quick tour" : undefined}
                className={`flex w-full items-center gap-2 rounded bg-purple-50 py-1.5 text-sm text-purple-700 hover:bg-purple-100 ${
                  collapsed ? "justify-center px-2" : "px-3 pr-7"
                }`}
              >
                <LightbulbIcon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">Quick tour</span>}
              </button>
            </form>
            {!collapsed && (
              <button
                type="button"
                onClick={() => hideShortcut("nav-quick-tour")}
                aria-label="Hide Quick tour - find it again in Settings > Help"
                title="Hide - find it again in Settings > Help"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-purple-400 hover:bg-purple-200 hover:text-purple-700"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        {showGuidedSetup && (
          <div className="relative">
            <Link
              href="/setup"
              onClick={onNavigate}
              title={collapsed ? "Guided setup" : undefined}
              className={`flex items-center gap-2 rounded bg-purple-50 py-1.5 text-sm text-purple-700 hover:bg-purple-100 ${
                collapsed ? "justify-center px-2" : "px-3 pr-7"
              }`}
            >
              <ChecklistIcon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">Guided setup</span>}
            </Link>
            {!collapsed && (
              <button
                type="button"
                onClick={() => hideShortcut("nav-guided-setup")}
                aria-label="Hide Guided setup - find it again in Settings > Help"
                title="Hide - find it again in Settings > Help"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-purple-400 hover:bg-purple-200 hover:text-purple-700"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </nav>
      <div className="border-t border-notion-hairline p-2">
        <form action={logout}>
          <button
            type="submit"
            title={collapsed ? "Log out" : undefined}
            className={`flex w-full items-center gap-2 rounded py-1.5 text-sm text-slate-500 hover:bg-notion-hover ${
              collapsed ? "justify-center px-2" : "px-3 text-left"
            }`}
          >
            <LogoutIcon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Log out</span>}
          </button>
        </form>
      </div>
    </>
  );
}

// Full-width shell with a 240px sidebar (SPEC.md T28) - every authenticated
// page (`src/app/(app)/*`) renders inside this via `(app)/layout.tsx`
// instead of each page building its own nav/logout, which is what every
// page did individually before T28.
//
// Collapsible (SPEC.md T44): collapses to a 64px icon-only rail. The
// preference is a client-only `localStorage` value, not a DB column (no
// user_id/RLS needed for it) - `collapsed` starts `false` on both server
// and first client render (so there's no hydration mismatch), then a
// post-mount effect reads the stored preference and flips it if needed,
// same tradeoff any localStorage-backed UI preference makes in an SSR app.
//
// Mobile (SPEC.md T89): below `lg` the rail is fully hidden (it was never
// usable at phone widths) and replaced by a slim top bar with a hamburger
// button; tapping it opens the same nav as a left-edge MobileDrawer.
export function AppShell({
  greetingName,
  onboardingChoice,
  onboardingTourStep,
  onboardingTourCompletedAt,
  children,
}: {
  greetingName: string;
  onboardingChoice: string | null;
  onboardingTourStep: number | null;
  onboardingTourCompletedAt: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Reading localStorage during the lazy useState initializer instead
    // would avoid this effect, but its return value would then differ
    // between the server render (no `window`) and the client's first
    // render, which is a real hydration mismatch - not just a lint
    // preference. Setting state here, after hydration, is the correct fix
    // for this specific SSR-plus-localStorage case, not the "you might not
    // need an effect" anti-pattern the rule usually flags.
    if (localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(true);
    }
  }, []);

  // Close the drawer on navigation to a different route (back/forward,
  // browser gestures) as well as on link taps handled via onNavigate below.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      <GuidedTour
        onboardingChoice={onboardingChoice}
        onboardingTourStep={onboardingTourStep}
        onboardingTourCompletedAt={onboardingTourCompletedAt}
      />
      <div className="flex items-center gap-2 border-b border-notion-hairline bg-white p-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          data-tour="nav-menu"
          className="rounded p-1.5 text-slate-500 hover:bg-notion-hover hover:text-notion-text"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <LogoMark className="h-5 w-5 text-notion-text" />
        <p className="text-sm font-semibold text-notion-text">Orium</p>
      </div>

      <aside
        className={`sticky top-0 relative hidden h-screen shrink-0 flex-col border-r border-notion-hairline bg-white transition-all duration-200 lg:flex ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-notion-hairline bg-white text-slate-400 shadow-sm hover:bg-notion-hover hover:text-notion-text"
        >
          <ChevronIcon direction={collapsed ? "right" : "left"} className="h-3.5 w-3.5" />
        </button>
        <SidebarContent collapsed={collapsed} pathname={pathname} greetingName={greetingName} />
      </aside>

      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} side="left" widthClassName="w-64">
        <SidebarContent
          collapsed={false}
          pathname={pathname}
          greetingName={greetingName}
          onNavigate={() => setMobileOpen(false)}
          onClose={() => setMobileOpen(false)}
        />
      </MobileDrawer>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
