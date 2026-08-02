"use client";

import { useState } from "react";
import { SlidersIcon } from "@/components/navIcons";

// T231: every list page (Bills, Income, Debt, Savings, Misc, Budgets,
// History, Updates) renders the same `flex flex-wrap items-end gap-4` filter
// bar with 6-8 controls in it. At desktop widths those sit on one or two
// tidy lines; at 375px each control wraps onto its own line, so the bar grew
// to roughly half the screen and pushed the actual list - the thing the page
// is for - below the fold on every one of those pages.
//
// Collapsed behind a button below `md`, unchanged at `md` and up. The panel
// is always rendered (not conditionally mounted) so every filter keeps its
// state when collapsed, and so a filter applied on desktop doesn't silently
// reset when the same page is opened on a phone.
//
// `activeCount` badges the button when something is filtering, since a
// collapsed bar would otherwise hide the reason a list looks short - the
// same "don't hide state behind a toggle" care T184 needed for switched-off
// items.
export function CollapsibleFilters({
  activeCount,
  children,
}: {
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 rounded-lg border border-notion-hairline bg-white">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between p-3 text-sm font-medium text-notion-text hover:bg-notion-hover md:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersIcon className="h-4 w-4 text-slate-400" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-notion-accent px-1.5 py-0.5 text-xs font-medium text-white">
              {activeCount}
            </span>
          )}
        </span>
        <span className="text-xs text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>
      <div className={`p-4 ${open ? "" : "hidden"} md:block`}>{children}</div>
    </div>
  );
}
