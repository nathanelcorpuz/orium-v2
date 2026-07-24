"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { ChevronIcon, LogoutIcon, NAV_ICONS } from "./navIcons";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/forecast", label: "Forecast" },
  { href: "/balances", label: "Balances" },
  { href: "/bills", label: "Bills" },
  { href: "/income", label: "Income" },
  { href: "/debt", label: "Debt" },
  { href: "/savings", label: "Savings" },
  { href: "/budgets", label: "Budgets" },
  { href: "/extra", label: "Extras" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

const COLLAPSED_STORAGE_KEY = "orium.sidebarCollapsed";

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
export function AppShell({
  greetingName,
  children,
}: {
  greetingName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-notion-hairline bg-white transition-all duration-200 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className={`flex items-center p-4 ${collapsed ? "justify-center" : "justify-between"}`}>
          {collapsed ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-notion-text text-sm font-semibold text-white hover:opacity-90"
            >
              O
            </button>
          ) : (
            <>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-notion-text">Orium</p>
                <p className="truncate text-xs text-slate-500">{greetingName}</p>
              </div>
              <button
                type="button"
                onClick={toggleCollapsed}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
              >
                <ChevronIcon direction="left" className="h-4 w-4" />
              </button>
            </>
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
                title={collapsed ? item.label : undefined}
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
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
