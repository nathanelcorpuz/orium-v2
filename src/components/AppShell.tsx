"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { ChevronIcon, CloseIcon, LogoMark, LogoutIcon, MenuIcon, NAV_ICONS } from "./navIcons";
import { MobileDrawer } from "./MobileDrawer";

// `tourKey` (T110) marks the nav items the guided app walkthrough links
// between pages - it's a distinct, stable identifier from `label` (which is
// user-facing display text, T106 already renamed "extra" to "Misc" there)
// so the walkthrough's step data doesn't depend on copy staying in sync.
// History has no `tourKey`: the walkthrough chain doesn't cover it.
const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/forecast", label: "Forecast", tourKey: "forecast" },
  { href: "/accounts", label: "Accounts", tourKey: "accounts" },
  { href: "/bills", label: "Bills", tourKey: "bills" },
  { href: "/income", label: "Income", tourKey: "income" },
  { href: "/debt", label: "Debt", tourKey: "debt" },
  { href: "/savings", label: "Savings", tourKey: "savings" },
  { href: "/budgets", label: "Budgets", tourKey: "budgets" },
  { href: "/extra", label: "Misc", tourKey: "misc" },
  { href: "/history", label: "History" },
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
  children,
}: {
  greetingName: string;
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
