"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/auth/actions";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/balances", label: "Balances" },
  { href: "/bills", label: "Bills" },
  { href: "/income", label: "Income" },
  { href: "/debt", label: "Debt" },
  { href: "/savings", label: "Savings" },
  { href: "/budgets", label: "Budgets" },
  { href: "/extra", label: "Extras" },
  { href: "/forecast", label: "Forecast" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

// Full-width shell with a 240px sidebar (SPEC.md T28) - every authenticated
// page (`src/app/(app)/*`) renders inside this via `(app)/layout.tsx`
// instead of each page building its own nav/logout, which is what every
// page did individually before T28.
export function AppShell({
  greetingName,
  children,
}: {
  greetingName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-notion-hairline bg-white">
        <div className="p-4">
          <p className="text-sm font-semibold text-notion-text">Orium</p>
          <p className="truncate text-xs text-slate-500">{greetingName}</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded px-3 py-1.5 text-sm ${
                  active
                    ? "bg-notion-hover font-medium text-notion-accent"
                    : "text-notion-text hover:bg-notion-hover"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-notion-hairline p-2">
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-notion-hover"
            >
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
