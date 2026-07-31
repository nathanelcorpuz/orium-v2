"use client";

import Link from "next/link";
import { setActiveScenario } from "@/app/(app)/scenarios/actions";
import { SubmitButton } from "./SubmitButton";

// T174 ("run possible scenario"): shown on Forecast/Dashboard whenever a
// scenario is toggled on, mirroring PreviewModeBar's own role - the one
// persistent, unmissable signal that some of the numbers on screen are
// hypothetical, not real. Amber rather than PreviewModeBar's dark/neutral
// tone, matching this app's own convention (amber = "act on this
// deliberately," already established by T173's due-today tag and T175's
// disabled-item badge) - preview mode is a passive read-only tour, but a
// scenario is something the user actively chose to turn on and will want to
// turn back off.
export function ScenarioModeBar({ scenarioName }: { scenarioName: string }) {
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm text-amber-950">
      <span>
        Viewing scenario &ldquo;{scenarioName}&rdquo; - some of the numbers below are hypothetical,
        not real.
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Link href="/scenarios" className="rounded border border-amber-950/30 px-3 py-1 hover:bg-amber-500/70">
          Manage scenarios
        </Link>
        <form action={setActiveScenario}>
          <input type="hidden" name="scenarioId" value="" />
          <SubmitButton className="rounded border border-amber-950/30 px-3 py-1 hover:bg-amber-500/70 disabled:opacity-50">
            Turn off
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
