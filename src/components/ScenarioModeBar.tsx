"use client";

import { useState } from "react";
import Link from "next/link";

// T174 ("run possible scenario"), redesigned by T183 for unlimited
// simultaneously active scenarios: mirrors PreviewModeBar's role - the one
// persistent, unmissable signal that some of the numbers on screen are
// hypothetical, not real. Amber, matching this app's own "act on this
// deliberately" convention (T173's due-today tag, T175's disabled badge).
//
// Deliberately smaller than T174's original version (the user's own
// request): a single line naming the count, with a click-to-expand list of
// which ones, rather than always spelling out every name inline - that
// used to work when only one scenario could ever be active at a time, but
// would grow unboundedly with several active at once.
export function ScenarioModeBar({ scenarioNames }: { scenarioNames: string[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="sticky top-0 z-40 bg-amber-500 px-4 py-1.5 text-sm text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-1 hover:opacity-80"
        >
          <span>
            {scenarioNames.length} scenario{scenarioNames.length === 1 ? "" : "s"} active - some
            numbers below are hypothetical
          </span>
          <span className="text-xs">{expanded ? "▲" : "▼"}</span>
        </button>
        <Link href="/scenarios" className="rounded border border-amber-950/30 px-2 py-0.5 text-xs hover:bg-amber-500/70">
          Manage
        </Link>
      </div>
      {expanded && (
        <ul className="mt-1 list-inside list-disc pl-1 text-xs">
          {scenarioNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
